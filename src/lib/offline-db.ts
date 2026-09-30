import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import type { AcademicInfoCategory } from "@/constants/academic-info-categories";
import { uuidv4 } from "@/lib/uuid";
import type { DocumentRow } from "@/types/documents";

// Local read-through cache so Documents, Academic Info, and Search still
// show something when there's no connection - required for the app's rural
// / low-connectivity target users. This is metadata only (rows, not file
// bytes); see offline-files.ts for the actual downloaded document files.
// Documents and folders are still a pure read-through cache, replaced
// wholesale on every successful online load. Academic info is different: it
// is local-first. Saves, edits and deletes land in this database first and
// carry a sync_status, and sync.ts pushes them to Supabase whenever a
// connection is available (see the academic info section below).

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    const database = openDatabaseSync("verifast-offline-cache.db");
    database.execSync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS cached_folders (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT
      );

      CREATE TABLE IF NOT EXISTS cached_documents (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT,
        mime_type TEXT,
        file_size INTEGER,
        created_at TEXT NOT NULL,
        icon_color TEXT
      );

      CREATE TABLE IF NOT EXISTS cached_academic_info (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        is_pinned INTEGER NOT NULL,
        posted_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_rev INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS downloaded_files (
        document_id TEXT PRIMARY KEY NOT NULL,
        local_uri TEXT NOT NULL,
        downloaded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cached_documents_user
        ON cached_documents (user_id);
      CREATE INDEX IF NOT EXISTS idx_cached_folders_user
        ON cached_folders (user_id);
      CREATE INDEX IF NOT EXISTS idx_cached_academic_info_user
        ON cached_academic_info (user_id);
    `);

    // Devices that installed the earlier read-only cache already have a
    // cached_academic_info table without the sync columns, and
    // CREATE TABLE IF NOT EXISTS won't alter it. Checking for the columns
    // (rather than a version number) keeps this safe to re-run.
    const academicInfoColumns = database.getAllSync<{ name: string }>(
      "PRAGMA table_info(cached_academic_info)",
    );
    if (!academicInfoColumns.some((c) => c.name === "sync_status")) {
      database.execSync(
        "ALTER TABLE cached_academic_info ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced'",
      );
    }
    if (!academicInfoColumns.some((c) => c.name === "local_rev")) {
      database.execSync(
        "ALTER TABLE cached_academic_info ADD COLUMN local_rev INTEGER NOT NULL DEFAULT 0",
      );
    }

    db = database;
  }
  return db;
}

export type CachedFolder = {
  id: string;
  name: string;
  category: string | null;
};

export type SyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete";

export type ServerAcademicInfoRow = {
  id: string;
  category: AcademicInfoCategory;
  title: string;
  content: string | null;
  is_pinned: boolean;
  posted_at: string;
};

export type CachedAcademicInfoRow = ServerAcademicInfoRow & {
  sync_status: SyncStatus;
};

export type PendingAcademicInfoRow = CachedAcademicInfoRow & {
  local_rev: number;
};

// --- Documents + folders (Documents screen, Search) ---

export function cacheDocuments(userId: string, documents: DocumentRow[]) {
  const database = getDb();
  database.withTransactionSync(() => {
    database.runSync("DELETE FROM cached_documents WHERE user_id = ?", [
      userId,
    ]);
    for (const doc of documents) {
      database.runSync(
        `INSERT INTO cached_documents
          (id, user_id, folder_id, name, file_path, mime_type, file_size, created_at, icon_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          doc.id,
          userId,
          doc.folder_id,
          doc.name,
          doc.file_path,
          doc.mime_type,
          doc.file_size,
          doc.created_at,
          doc.icon_color,
        ],
      );
    }
  });
}

export function getCachedDocuments(userId: string): DocumentRow[] {
  return getDb().getAllSync<DocumentRow>(
    "SELECT id, folder_id, name, file_path, mime_type, file_size, created_at, icon_color FROM cached_documents WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  );
}

export function cacheFolders(userId: string, folders: CachedFolder[]) {
  const database = getDb();
  database.withTransactionSync(() => {
    database.runSync("DELETE FROM cached_folders WHERE user_id = ?", [userId]);
    for (const folder of folders) {
      database.runSync(
        "INSERT INTO cached_folders (id, user_id, name, category) VALUES (?, ?, ?, ?)",
        [folder.id, userId, folder.name, folder.category],
      );
    }
  });
}

export function getCachedFolders(userId: string): CachedFolder[] {
  return getDb().getAllSync<CachedFolder>(
    "SELECT id, name, category FROM cached_folders WHERE user_id = ?",
    [userId],
  );
}

export function searchCachedDocuments(userId: string, query: string) {
  return getDb().getAllSync<DocumentRow>(
    `SELECT id, folder_id, name, file_path, mime_type, file_size, created_at, icon_color
     FROM cached_documents
     WHERE user_id = ? AND name LIKE ? COLLATE NOCASE
     ORDER BY created_at DESC LIMIT 8`,
    [userId, `%${query}%`],
  );
}

// --- Academic info (local-first: Academic Info screen, Search, sync.ts) ---
//
// Rows here are the source of truth for the UI. sync_status says where a
// row stands relative to the server:
//   synced          - matches the server as of the last sync
//   pending_create  - made on this device, not on the server yet
//   pending_update  - edited on this device, server has an older version
//   pending_delete  - deleted on this device, still to be deleted remotely
// local_rev goes up on every local change, so sync.ts can tell "the row I
// just pushed" apart from "the row the user edited again while it was
// being pushed" and only mark the former as synced.

type AcademicInfoDbRow = Omit<ServerAcademicInfoRow, "is_pinned"> & {
  is_pinned: number;
  sync_status: SyncStatus;
  local_rev: number;
};

const ACADEMIC_INFO_COLUMNS =
  "id, category, title, content, is_pinned, posted_at, sync_status, local_rev";

function toAcademicInfoRow(row: AcademicInfoDbRow): PendingAcademicInfoRow {
  return { ...row, is_pinned: row.is_pinned === 1 };
}

// What the UI shows: everything except rows waiting to be deleted remotely.
export function getCachedAcademicInfo(userId: string): CachedAcademicInfoRow[] {
  const rows = getDb().getAllSync<AcademicInfoDbRow>(
    `SELECT ${ACADEMIC_INFO_COLUMNS} FROM cached_academic_info
     WHERE user_id = ? AND sync_status != 'pending_delete'
     ORDER BY is_pinned DESC, posted_at DESC`,
    [userId],
  );
  return rows.map(toAcademicInfoRow);
}

// Applies the server's current rows without touching unsynced local work:
//  - synced rows the server no longer has were deleted elsewhere, so drop them
//  - rows with pending local changes are left alone (the local version wins
//    until sync.ts has pushed it)
//  - everything else is inserted or refreshed from the server
export function mergeServerAcademicInfo(
  userId: string,
  serverRows: ServerAcademicInfoRow[],
) {
  const database = getDb();
  const serverIds = new Set(serverRows.map((row) => row.id));

  database.withTransactionSync(() => {
    const syncedLocal = database.getAllSync<{ id: string }>(
      "SELECT id FROM cached_academic_info WHERE user_id = ? AND sync_status = 'synced'",
      [userId],
    );
    for (const { id } of syncedLocal) {
      if (!serverIds.has(id)) {
        database.runSync("DELETE FROM cached_academic_info WHERE id = ?", [id]);
      }
    }

    for (const row of serverRows) {
      database.runSync(
        `INSERT INTO cached_academic_info
          (id, user_id, category, title, content, is_pinned, posted_at, sync_status, local_rev)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', 0)
         ON CONFLICT(id) DO UPDATE SET
           category = excluded.category,
           title = excluded.title,
           content = excluded.content,
           is_pinned = excluded.is_pinned,
           posted_at = excluded.posted_at
         WHERE cached_academic_info.sync_status = 'synced'`,
        [
          row.id,
          userId,
          row.category,
          row.title,
          row.content,
          row.is_pinned ? 1 : 0,
          row.posted_at,
        ],
      );
    }
  });
}

type AcademicInfoInput = {
  // Omit to create a new entry; pass an existing id to edit it.
  id?: string;
  category: AcademicInfoCategory;
  title: string;
  content: string | null;
  is_pinned: boolean;
};

// Saves to the device only - works with or without a connection. The entry
// is flagged for sync.ts to push later.
export function saveAcademicInfoLocal(
  userId: string,
  input: AcademicInfoInput,
): string {
  const database = getDb();

  if (input.id) {
    const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
      "SELECT sync_status FROM cached_academic_info WHERE id = ? AND user_id = ?",
      [input.id, userId],
    );
    // Editing something that was never pushed stays a create - the server
    // has never heard of it, so there's nothing to "update" there yet.
    const nextStatus: SyncStatus =
      existing?.sync_status === "pending_create"
        ? "pending_create"
        : "pending_update";

    database.runSync(
      `UPDATE cached_academic_info
       SET category = ?, title = ?, content = ?, is_pinned = ?,
           sync_status = ?, local_rev = local_rev + 1
       WHERE id = ? AND user_id = ?`,
      [
        input.category,
        input.title,
        input.content,
        input.is_pinned ? 1 : 0,
        nextStatus,
        input.id,
        userId,
      ],
    );
    return input.id;
  }

  const id = uuidv4();
  database.runSync(
    `INSERT INTO cached_academic_info
      (id, user_id, category, title, content, is_pinned, posted_at, sync_status, local_rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_create', 1)`,
    [
      id,
      userId,
      input.category,
      input.title,
      input.content,
      input.is_pinned ? 1 : 0,
      new Date().toISOString(),
    ],
  );
  return id;
}

export function deleteAcademicInfoLocal(userId: string, id: string) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_academic_info WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!existing) return;

  if (existing.sync_status === "pending_create") {
    // Never reached the server, so there's nothing to delete remotely.
    database.runSync("DELETE FROM cached_academic_info WHERE id = ?", [id]);
    return;
  }

  database.runSync(
    `UPDATE cached_academic_info
     SET sync_status = 'pending_delete', local_rev = local_rev + 1
     WHERE id = ?`,
    [id],
  );
}

// Oldest changes first, creates before updates before deletes.
export function getPendingAcademicInfo(
  userId: string,
): PendingAcademicInfoRow[] {
  const rows = getDb().getAllSync<AcademicInfoDbRow>(
    `SELECT ${ACADEMIC_INFO_COLUMNS} FROM cached_academic_info
     WHERE user_id = ? AND sync_status != 'synced'
     ORDER BY CASE sync_status
       WHEN 'pending_create' THEN 0
       WHEN 'pending_update' THEN 1
       ELSE 2
     END, posted_at ASC`,
    [userId],
  );
  return rows.map(toAcademicInfoRow);
}

// Only marks the row synced if it hasn't been edited again since it was
// read for pushing (same local_rev) - otherwise it stays pending and the
// newer edit goes out on the next sync.
export function markAcademicInfoSynced(id: string, localRev: number) {
  getDb().runSync(
    "UPDATE cached_academic_info SET sync_status = 'synced' WHERE id = ? AND local_rev = ?",
    [id, localRev],
  );
}

export function removeDeletedAcademicInfo(id: string, localRev: number) {
  getDb().runSync(
    "DELETE FROM cached_academic_info WHERE id = ? AND local_rev = ? AND sync_status = 'pending_delete'",
    [id, localRev],
  );
}

// --- Downloaded document files (offline-files.ts) ---

export function getLocalFileUri(documentId: string): string | null {
  const row = getDb().getFirstSync<{ local_uri: string }>(
    "SELECT local_uri FROM downloaded_files WHERE document_id = ?",
    [documentId],
  );
  return row?.local_uri ?? null;
}

export function recordDownloadedFile(documentId: string, localUri: string) {
  getDb().runSync(
    "INSERT OR REPLACE INTO downloaded_files (document_id, local_uri, downloaded_at) VALUES (?, ?, ?)",
    [documentId, localUri, new Date().toISOString()],
  );
}

export function forgetDownloadedFile(documentId: string) {
  getDb().runSync("DELETE FROM downloaded_files WHERE document_id = ?", [
    documentId,
  ]);
}

export function searchCachedAcademicInfo(userId: string, query: string) {
  const rows = getDb().getAllSync<AcademicInfoDbRow>(
    `SELECT ${ACADEMIC_INFO_COLUMNS}
     FROM cached_academic_info
     WHERE user_id = ? AND sync_status != 'pending_delete'
       AND title LIKE ? COLLATE NOCASE
     ORDER BY posted_at DESC LIMIT 8`,
    [userId, `%${query}%`],
  );
  return rows.map(toAcademicInfoRow);
}
