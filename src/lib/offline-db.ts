import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import type { AcademicInfoCategory } from "@/constants/academic-info-categories";
import type { ReminderCategory } from "@/constants/reminder-categories";
import type { RequestStatus } from "@/constants/request-status";
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
        icon_color TEXT,
        updated_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_rev INTEGER NOT NULL DEFAULT 0
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

      CREATE TABLE IF NOT EXISTS cached_document_requests (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        office TEXT,
        status TEXT NOT NULL,
        requested_date TEXT NOT NULL,
        released_date TEXT,
        created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_rev INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS cached_reminders (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        due_date TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_rev INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS cached_calendar_syncs (
        reminder_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        calendar_event_id TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        local_rev INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (reminder_id, device_id)
      );

      CREATE TABLE IF NOT EXISTS cached_profile (
        user_id TEXT PRIMARY KEY NOT NULL,
        full_name TEXT,
        student_id TEXT,
        program TEXT,
        avatar_url TEXT
      );

      CREATE TABLE IF NOT EXISTS cached_subscription (
        user_id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        trial_ends_at TEXT,
        current_period_end TEXT
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
      CREATE INDEX IF NOT EXISTS idx_cached_document_requests_user
        ON cached_document_requests (user_id);
      CREATE INDEX IF NOT EXISTS idx_cached_reminders_user
        ON cached_reminders (user_id);
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

    // Same idea for cached_documents: Home sorts recent documents by
    // updated_at, which the first version of this cache didn't store.
    const documentColumns = database.getAllSync<{ name: string }>(
      "PRAGMA table_info(cached_documents)",
    );
    if (!documentColumns.some((c) => c.name === "updated_at")) {
      database.execSync(
        "ALTER TABLE cached_documents ADD COLUMN updated_at TEXT",
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

const DOCUMENT_COLUMNS =
  "id, folder_id, name, file_path, mime_type, file_size, created_at, icon_color, updated_at, sync_status, local_rev";

// Documents are local-first like academic info, requests and reminders:
// this table is what the screens show, sync_status tracks what still has to
// be pushed, and local_rev guards against marking a row synced when it was
// edited again mid-push. Merges leave rows with pending changes alone.
export function mergeServerDocuments(
  userId: string,
  serverRows: DocumentRow[],
) {
  const database = getDb();
  const serverIds = new Set(serverRows.map((row) => row.id));

  database.withTransactionSync(() => {
    const syncedLocal = database.getAllSync<{ id: string }>(
      "SELECT id FROM cached_documents WHERE user_id = ? AND sync_status = 'synced'",
      [userId],
    );
    for (const { id } of syncedLocal) {
      if (!serverIds.has(id)) {
        database.runSync("DELETE FROM cached_documents WHERE id = ?", [id]);
      }
    }

    for (const doc of serverRows) {
      database.runSync(
        `INSERT INTO cached_documents
          (id, user_id, folder_id, name, file_path, mime_type, file_size, created_at, icon_color, updated_at, sync_status, local_rev)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0)
         ON CONFLICT(id) DO UPDATE SET
           folder_id = excluded.folder_id,
           name = excluded.name,
           file_path = excluded.file_path,
           mime_type = excluded.mime_type,
           file_size = excluded.file_size,
           created_at = excluded.created_at,
           icon_color = excluded.icon_color,
           updated_at = excluded.updated_at
         WHERE cached_documents.sync_status = 'synced'`,
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
          doc.updated_at ?? null,
        ],
      );
    }
  });
}

// What the screens show: everything except documents waiting to be deleted
// remotely.
export function getCachedDocuments(userId: string): DocumentRow[] {
  return getDb().getAllSync<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS} FROM cached_documents
     WHERE user_id = ? AND sync_status != 'pending_delete'
     ORDER BY created_at DESC`,
    [userId],
  );
}

type DocumentChanges = {
  name?: string;
  folder_id?: string;
  icon_color?: string;
};

// Rename / move / recolor, saved to the device only.
export function updateDocumentLocal(
  userId: string,
  id: string,
  changes: DocumentChanges,
) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_documents WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!existing) return;

  const nextStatus: SyncStatus =
    existing.sync_status === "pending_create"
      ? "pending_create"
      : "pending_update";

  database.runSync(
    `UPDATE cached_documents
     SET name = COALESCE(?, name),
         folder_id = COALESCE(?, folder_id),
         icon_color = COALESCE(?, icon_color),
         sync_status = ?, local_rev = local_rev + 1
     WHERE id = ? AND user_id = ?`,
    [
      changes.name ?? null,
      changes.folder_id ?? null,
      changes.icon_color ?? null,
      nextStatus,
      id,
      userId,
    ],
  );
}

export function deleteDocumentLocal(userId: string, id: string) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_documents WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!existing) return;

  if (existing.sync_status === "pending_create") {
    // Never reached the server, so there's nothing to delete remotely.
    database.runSync("DELETE FROM cached_documents WHERE id = ?", [id]);
    return;
  }

  database.runSync(
    `UPDATE cached_documents
     SET sync_status = 'pending_delete', local_rev = local_rev + 1
     WHERE id = ?`,
    [id],
  );
}

export type PendingDocumentRow = DocumentRow & {
  sync_status: SyncStatus;
  local_rev: number;
};

export function getPendingDocuments(userId: string): PendingDocumentRow[] {
  return getDb().getAllSync<PendingDocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS} FROM cached_documents
     WHERE user_id = ? AND sync_status != 'synced'
     ORDER BY CASE sync_status
       WHEN 'pending_create' THEN 0
       WHEN 'pending_update' THEN 1
       ELSE 2
     END, created_at ASC`,
    [userId],
  );
}

export function markDocumentSynced(id: string, localRev: number) {
  getDb().runSync(
    "UPDATE cached_documents SET sync_status = 'synced' WHERE id = ? AND local_rev = ?",
    [id, localRev],
  );
}

export function removeDeletedDocument(id: string, localRev: number) {
  getDb().runSync(
    "DELETE FROM cached_documents WHERE id = ? AND local_rev = ? AND sync_status = 'pending_delete'",
    [id, localRev],
  );
}

// For an edit whose document turned out to be deleted elsewhere: drop the
// local copy instead of retrying forever.
export function discardDocument(id: string, localRev: number) {
  getDb().runSync(
    "DELETE FROM cached_documents WHERE id = ? AND local_rev = ?",
    [id, localRev],
  );
  getDb().runSync("DELETE FROM downloaded_files WHERE document_id = ?", [id]);
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
     WHERE user_id = ? AND sync_status != 'pending_delete'
       AND name LIKE ? COLLATE NOCASE
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

// --- Document requests (local-first: Requested Docs screen, sync.ts) ---
//
// Same model as academic info above: this table is what the screen shows,
// sync_status tracks what still has to be pushed, and local_rev guards
// against marking a row synced when it was edited again mid-push.

export type ServerRequestRow = {
  id: string;
  document_type: string;
  office: string | null;
  status: RequestStatus;
  requested_date: string;
  released_date: string | null;
  created_at: string;
};

export type CachedRequestRow = ServerRequestRow & {
  sync_status: SyncStatus;
};

export type PendingRequestRow = CachedRequestRow & { local_rev: number };

const REQUEST_COLUMNS =
  "id, document_type, office, status, requested_date, released_date, created_at, sync_status, local_rev";

// Today's date as YYYY-MM-DD in the phone's own timezone. The server's
// CURRENT_DATE default is in UTC, which in the Philippines is still
// "yesterday" until 8 AM - and an offline request has to carry its date
// with it anyway.
function todayLocalDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function getCachedRequests(userId: string): CachedRequestRow[] {
  return getDb().getAllSync<PendingRequestRow>(
    `SELECT ${REQUEST_COLUMNS} FROM cached_document_requests
     WHERE user_id = ? AND sync_status != 'pending_delete'
     ORDER BY created_at DESC`,
    [userId],
  );
}

export function mergeServerRequests(
  userId: string,
  serverRows: ServerRequestRow[],
) {
  const database = getDb();
  const serverIds = new Set(serverRows.map((row) => row.id));

  database.withTransactionSync(() => {
    const syncedLocal = database.getAllSync<{ id: string }>(
      "SELECT id FROM cached_document_requests WHERE user_id = ? AND sync_status = 'synced'",
      [userId],
    );
    for (const { id } of syncedLocal) {
      if (!serverIds.has(id)) {
        database.runSync("DELETE FROM cached_document_requests WHERE id = ?", [
          id,
        ]);
      }
    }

    for (const row of serverRows) {
      database.runSync(
        `INSERT INTO cached_document_requests
          (id, user_id, document_type, office, status, requested_date, released_date, created_at, sync_status, local_rev)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', 0)
         ON CONFLICT(id) DO UPDATE SET
           document_type = excluded.document_type,
           office = excluded.office,
           status = excluded.status,
           requested_date = excluded.requested_date,
           released_date = excluded.released_date,
           created_at = excluded.created_at
         WHERE cached_document_requests.sync_status = 'synced'`,
        [
          row.id,
          userId,
          row.document_type,
          row.office,
          row.status,
          row.requested_date,
          row.released_date,
          row.created_at,
        ],
      );
    }
  });
}

export function createRequestLocal(
  userId: string,
  input: { document_type: string; office: string | null },
): string {
  const id = uuidv4();
  getDb().runSync(
    `INSERT INTO cached_document_requests
      (id, user_id, document_type, office, status, requested_date, released_date, created_at, sync_status, local_rev)
     VALUES (?, ?, ?, ?, 'requested', ?, NULL, ?, 'pending_create', 1)`,
    [
      id,
      userId,
      input.document_type,
      input.office,
      todayLocalDate(),
      new Date().toISOString(),
    ],
  );
  return id;
}

// Moves a request to its next status. Reaching "released" also stamps the
// released date, exactly like the online-only version did.
export function advanceRequestLocal(
  userId: string,
  id: string,
  nextStatus: RequestStatus,
) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_document_requests WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!existing) return;

  const nextSyncStatus: SyncStatus =
    existing.sync_status === "pending_create"
      ? "pending_create"
      : "pending_update";

  database.runSync(
    `UPDATE cached_document_requests
     SET status = ?,
         released_date = CASE WHEN ? = 'released' THEN ? ELSE released_date END,
         sync_status = ?, local_rev = local_rev + 1
     WHERE id = ? AND user_id = ?`,
    [nextStatus, nextStatus, todayLocalDate(), nextSyncStatus, id, userId],
  );
}

export function deleteRequestLocal(userId: string, id: string) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_document_requests WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!existing) return;

  if (existing.sync_status === "pending_create") {
    database.runSync("DELETE FROM cached_document_requests WHERE id = ?", [id]);
    return;
  }

  database.runSync(
    `UPDATE cached_document_requests
     SET sync_status = 'pending_delete', local_rev = local_rev + 1
     WHERE id = ?`,
    [id],
  );
}

export function getPendingRequests(userId: string): PendingRequestRow[] {
  return getDb().getAllSync<PendingRequestRow>(
    `SELECT ${REQUEST_COLUMNS} FROM cached_document_requests
     WHERE user_id = ? AND sync_status != 'synced'
     ORDER BY CASE sync_status
       WHEN 'pending_create' THEN 0
       WHEN 'pending_update' THEN 1
       ELSE 2
     END, created_at ASC`,
    [userId],
  );
}

export function markRequestSynced(id: string, localRev: number) {
  getDb().runSync(
    "UPDATE cached_document_requests SET sync_status = 'synced' WHERE id = ? AND local_rev = ?",
    [id, localRev],
  );
}

export function removeDeletedRequest(id: string, localRev: number) {
  getDb().runSync(
    "DELETE FROM cached_document_requests WHERE id = ? AND local_rev = ? AND sync_status = 'pending_delete'",
    [id, localRev],
  );
}

// --- Reminders (local-first: Deadlines & Reminders screen, sync.ts) ---
//
// Same model as academic info and document requests above. Two tables:
//  - cached_reminders: the reminders themselves.
//  - cached_calendar_syncs: which device calendar event this phone created
//    for which reminder. The event itself lives on the phone, so creating
//    one always works offline; this table is the record of it, pushed to
//    Supabase's reminder_calendar_syncs whenever a connection is available.

export type ServerReminderRow = {
  id: string;
  title: string;
  category: ReminderCategory;
  due_date: string;
};

export type CachedReminderRow = ServerReminderRow & {
  sync_status: SyncStatus;
  // This device's calendar event for the reminder, if Calendar Sync made one.
  calendar_event_id: string | null;
};

export type PendingReminderRow = ServerReminderRow & {
  sync_status: SyncStatus;
  local_rev: number;
};

// What the screen shows: everything except reminders waiting to be deleted
// remotely, soonest due date first, each with this device's calendar event.
export function getCachedReminders(
  userId: string,
  deviceId: string,
): CachedReminderRow[] {
  return getDb().getAllSync<CachedReminderRow>(
    `SELECT r.id, r.title, r.category, r.due_date, r.sync_status,
            cs.calendar_event_id AS calendar_event_id
     FROM cached_reminders r
     LEFT JOIN cached_calendar_syncs cs
       ON cs.reminder_id = r.id
      AND cs.device_id = ?
      AND cs.sync_status != 'pending_delete'
     WHERE r.user_id = ? AND r.sync_status != 'pending_delete'
     ORDER BY r.due_date ASC`,
    [deviceId, userId],
  );
}

// Just the fields notification scheduling needs.
export function getRemindersForScheduling(userId: string): ServerReminderRow[] {
  return getDb().getAllSync<ServerReminderRow>(
    `SELECT id, title, category, due_date FROM cached_reminders
     WHERE user_id = ? AND sync_status != 'pending_delete'`,
    [userId],
  );
}

export function mergeServerReminders(
  userId: string,
  serverRows: ServerReminderRow[],
) {
  const database = getDb();
  const serverIds = new Set(serverRows.map((row) => row.id));

  database.withTransactionSync(() => {
    const syncedLocal = database.getAllSync<{ id: string }>(
      "SELECT id FROM cached_reminders WHERE user_id = ? AND sync_status = 'synced'",
      [userId],
    );
    for (const { id } of syncedLocal) {
      if (!serverIds.has(id)) {
        // Gone from the server. Its calendar sync rows go with it, the
        // same way the server's own cascade deletes them.
        database.runSync("DELETE FROM cached_reminders WHERE id = ?", [id]);
        database.runSync(
          "DELETE FROM cached_calendar_syncs WHERE reminder_id = ?",
          [id],
        );
      }
    }

    for (const row of serverRows) {
      database.runSync(
        `INSERT INTO cached_reminders
          (id, user_id, title, category, due_date, sync_status, local_rev)
         VALUES (?, ?, ?, ?, ?, 'synced', 0)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           category = excluded.category,
           due_date = excluded.due_date
         WHERE cached_reminders.sync_status = 'synced'`,
        [row.id, userId, row.title, row.category, row.due_date],
      );
    }
  });
}

type ReminderInput = {
  // Omit to create a new reminder; pass an existing id to edit it.
  id?: string;
  title: string;
  category: ReminderCategory;
  due_date: string;
};

// Saves to the device only - works with or without a connection.
export function saveReminderLocal(
  userId: string,
  input: ReminderInput,
): string {
  const database = getDb();

  if (input.id) {
    const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
      "SELECT sync_status FROM cached_reminders WHERE id = ? AND user_id = ?",
      [input.id, userId],
    );
    const nextStatus: SyncStatus =
      existing?.sync_status === "pending_create"
        ? "pending_create"
        : "pending_update";

    database.runSync(
      `UPDATE cached_reminders
       SET title = ?, category = ?, due_date = ?,
           sync_status = ?, local_rev = local_rev + 1
       WHERE id = ? AND user_id = ?`,
      [
        input.title,
        input.category,
        input.due_date,
        nextStatus,
        input.id,
        userId,
      ],
    );
    return input.id;
  }

  const id = uuidv4();
  database.runSync(
    `INSERT INTO cached_reminders
      (id, user_id, title, category, due_date, sync_status, local_rev)
     VALUES (?, ?, ?, ?, ?, 'pending_create', 1)`,
    [id, userId, input.title, input.category, input.due_date],
  );
  return id;
}

export function deleteReminderLocal(userId: string, id: string) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_reminders WHERE id = ? AND user_id = ?",
    [id, userId],
  );
  if (!existing) return;

  database.withTransactionSync(() => {
    // The server deletes a reminder's calendar sync rows along with it, so
    // the local copies (and any pending push of them) go right away too.
    database.runSync(
      "DELETE FROM cached_calendar_syncs WHERE reminder_id = ?",
      [id],
    );

    if (existing.sync_status === "pending_create") {
      // Never reached the server, so there's nothing to delete remotely.
      database.runSync("DELETE FROM cached_reminders WHERE id = ?", [id]);
    } else {
      database.runSync(
        `UPDATE cached_reminders
         SET sync_status = 'pending_delete', local_rev = local_rev + 1
         WHERE id = ?`,
        [id],
      );
    }
  });
}

export function getPendingReminders(userId: string): PendingReminderRow[] {
  return getDb().getAllSync<PendingReminderRow>(
    `SELECT id, title, category, due_date, sync_status, local_rev
     FROM cached_reminders
     WHERE user_id = ? AND sync_status != 'synced'
     ORDER BY CASE sync_status
       WHEN 'pending_create' THEN 0
       WHEN 'pending_update' THEN 1
       ELSE 2
     END, due_date ASC`,
    [userId],
  );
}

export function markReminderSynced(id: string, localRev: number) {
  getDb().runSync(
    "UPDATE cached_reminders SET sync_status = 'synced' WHERE id = ? AND local_rev = ?",
    [id, localRev],
  );
}

export function removeDeletedReminder(id: string, localRev: number) {
  getDb().runSync(
    "DELETE FROM cached_reminders WHERE id = ? AND local_rev = ? AND sync_status = 'pending_delete'",
    [id, localRev],
  );
}

// For an edit whose reminder turned out to be deleted elsewhere: drop the
// local copy and its calendar sync rows instead of retrying forever.
export function discardReminder(id: string, localRev: number) {
  const database = getDb();
  database.withTransactionSync(() => {
    const result = database.runSync(
      "DELETE FROM cached_reminders WHERE id = ? AND local_rev = ?",
      [id, localRev],
    );
    if (result.changes > 0) {
      database.runSync(
        "DELETE FROM cached_calendar_syncs WHERE reminder_id = ?",
        [id],
      );
    }
  });
}

// --- Calendar syncs: this device's calendar event per reminder ---

export type PendingCalendarSyncRow = {
  reminder_id: string;
  calendar_event_id: string;
  sync_status: SyncStatus;
  local_rev: number;
};

export function setCalendarEventLocal(
  reminderId: string,
  deviceId: string,
  calendarEventId: string,
) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_calendar_syncs WHERE reminder_id = ? AND device_id = ?",
    [reminderId, deviceId],
  );

  if (!existing) {
    database.runSync(
      `INSERT INTO cached_calendar_syncs
        (reminder_id, device_id, calendar_event_id, sync_status, local_rev)
       VALUES (?, ?, ?, 'pending_create', 1)`,
      [reminderId, deviceId, calendarEventId],
    );
    return;
  }

  const nextStatus: SyncStatus =
    existing.sync_status === "pending_create"
      ? "pending_create"
      : "pending_update";
  database.runSync(
    `UPDATE cached_calendar_syncs
     SET calendar_event_id = ?, sync_status = ?, local_rev = local_rev + 1
     WHERE reminder_id = ? AND device_id = ?`,
    [calendarEventId, nextStatus, reminderId, deviceId],
  );
}

export function removeCalendarEventLocal(reminderId: string, deviceId: string) {
  const database = getDb();
  const existing = database.getFirstSync<{ sync_status: SyncStatus }>(
    "SELECT sync_status FROM cached_calendar_syncs WHERE reminder_id = ? AND device_id = ?",
    [reminderId, deviceId],
  );
  if (!existing) return;

  if (existing.sync_status === "pending_create") {
    database.runSync(
      "DELETE FROM cached_calendar_syncs WHERE reminder_id = ? AND device_id = ?",
      [reminderId, deviceId],
    );
    return;
  }

  database.runSync(
    `UPDATE cached_calendar_syncs
     SET sync_status = 'pending_delete', local_rev = local_rev + 1
     WHERE reminder_id = ? AND device_id = ?`,
    [reminderId, deviceId],
  );
}

export function getPendingCalendarSyncs(
  deviceId: string,
): PendingCalendarSyncRow[] {
  return getDb().getAllSync<PendingCalendarSyncRow>(
    `SELECT reminder_id, calendar_event_id, sync_status, local_rev
     FROM cached_calendar_syncs
     WHERE device_id = ? AND sync_status != 'synced'
     ORDER BY CASE sync_status WHEN 'pending_delete' THEN 1 ELSE 0 END`,
    [deviceId],
  );
}

export function markCalendarSyncSynced(
  reminderId: string,
  deviceId: string,
  localRev: number,
) {
  getDb().runSync(
    `UPDATE cached_calendar_syncs SET sync_status = 'synced'
     WHERE reminder_id = ? AND device_id = ? AND local_rev = ?`,
    [reminderId, deviceId, localRev],
  );
}

export function removeDeletedCalendarSync(
  reminderId: string,
  deviceId: string,
  localRev: number,
) {
  getDb().runSync(
    `DELETE FROM cached_calendar_syncs
     WHERE reminder_id = ? AND device_id = ? AND local_rev = ?
       AND sync_status = 'pending_delete'`,
    [reminderId, deviceId, localRev],
  );
}

export function mergeServerCalendarSyncs(
  deviceId: string,
  serverRows: { reminder_id: string; calendar_event_id: string }[],
) {
  const database = getDb();
  const serverIds = new Set(serverRows.map((row) => row.reminder_id));

  database.withTransactionSync(() => {
    const syncedLocal = database.getAllSync<{ reminder_id: string }>(
      "SELECT reminder_id FROM cached_calendar_syncs WHERE device_id = ? AND sync_status = 'synced'",
      [deviceId],
    );
    for (const { reminder_id } of syncedLocal) {
      if (!serverIds.has(reminder_id)) {
        database.runSync(
          "DELETE FROM cached_calendar_syncs WHERE reminder_id = ? AND device_id = ?",
          [reminder_id, deviceId],
        );
      }
    }

    for (const row of serverRows) {
      database.runSync(
        `INSERT INTO cached_calendar_syncs
          (reminder_id, device_id, calendar_event_id, sync_status, local_rev)
         VALUES (?, ?, ?, 'synced', 0)
         ON CONFLICT(reminder_id, device_id) DO UPDATE SET
           calendar_event_id = excluded.calendar_event_id
         WHERE cached_calendar_syncs.sync_status = 'synced'`,
        [row.reminder_id, deviceId, row.calendar_event_id],
      );
    }
  });
}

// --- Read-only account data: profile, plan, and Home's summaries ---
//
// Nothing here is edited offline (profile edits and billing stay online),
// so these are plain copies refreshed by sync.ts - they just let Home,
// Profile and the Free-plan check keep working without a connection.

export type CachedProfile = {
  full_name: string | null;
  student_id: string | null;
  program: string | null;
  avatar_url: string | null;
};

export function cacheProfile(userId: string, profile: CachedProfile | null) {
  const database = getDb();
  if (!profile) {
    database.runSync("DELETE FROM cached_profile WHERE user_id = ?", [userId]);
    return;
  }
  database.runSync(
    `INSERT OR REPLACE INTO cached_profile
      (user_id, full_name, student_id, program, avatar_url)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId,
      profile.full_name,
      profile.student_id,
      profile.program,
      profile.avatar_url,
    ],
  );
}

export function getCachedProfile(userId: string): CachedProfile | null {
  return getDb().getFirstSync<CachedProfile>(
    "SELECT full_name, student_id, program, avatar_url FROM cached_profile WHERE user_id = ?",
    [userId],
  );
}

export type CachedSubscription = {
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export function cacheSubscription(
  userId: string,
  subscription: CachedSubscription | null,
) {
  const database = getDb();
  if (!subscription) {
    database.runSync("DELETE FROM cached_subscription WHERE user_id = ?", [
      userId,
    ]);
    return;
  }
  database.runSync(
    `INSERT OR REPLACE INTO cached_subscription
      (user_id, status, trial_ends_at, current_period_end)
     VALUES (?, ?, ?, ?)`,
    [
      userId,
      subscription.status,
      subscription.trial_ends_at,
      subscription.current_period_end,
    ],
  );
}

export function getCachedSubscription(
  userId: string,
): CachedSubscription | null {
  return getDb().getFirstSync<CachedSubscription>(
    "SELECT status, trial_ends_at, current_period_end FROM cached_subscription WHERE user_id = ?",
    [userId],
  );
}

// Home's "Documents Stored" count and "Recently Accessed" list, from the
// cached documents. Falls back to created_at for documents cached before
// updated_at was stored.
export function getCachedDocumentSummary(userId: string): {
  count: number;
  recent: {
    id: string;
    name: string;
    mime_type: string | null;
    opened_at: string;
  }[];
} {
  const database = getDb();
  const countRow = database.getFirstSync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM cached_documents WHERE user_id = ? AND sync_status != 'pending_delete'",
    [userId],
  );
  const recent = database.getAllSync<{
    id: string;
    name: string;
    mime_type: string | null;
    opened_at: string;
  }>(
    `SELECT id, name, mime_type, COALESCE(updated_at, created_at) AS opened_at
     FROM cached_documents
     WHERE user_id = ? AND sync_status != 'pending_delete'
     ORDER BY opened_at DESC LIMIT 3`,
    [userId],
  );
  return { count: countRow?.total ?? 0, recent };
}

// Home's "Document Alerts": the soonest-due reminders.
export function getUpcomingReminders(
  userId: string,
  limit: number,
): ServerReminderRow[] {
  return getDb().getAllSync<ServerReminderRow>(
    `SELECT id, title, category, due_date FROM cached_reminders
     WHERE user_id = ? AND sync_status != 'pending_delete'
     ORDER BY due_date ASC LIMIT ?`,
    [userId, limit],
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

// --- Account deletion cleanup ------------------------------------------
// Used only when the user deletes their account: everything this device
// holds for them has to go, not just the signed-in session. Two steps on
// purpose - the caller needs the local file paths and calendar event ids
// *before* the rows that reference them are wiped.

export function getLocalArtifactsForUser(userId: string): {
  fileUris: string[];
  calendarEventIds: string[];
} {
  // downloaded_files and cached_calendar_syncs have no user_id column of
  // their own, so they're tied to the user through the document / reminder
  // they point at.
  const files = getDb().getAllSync<{ local_uri: string }>(
    `SELECT local_uri FROM downloaded_files
     WHERE document_id IN (SELECT id FROM cached_documents WHERE user_id = ?)`,
    [userId],
  );
  const events = getDb().getAllSync<{ calendar_event_id: string }>(
    `SELECT calendar_event_id FROM cached_calendar_syncs
     WHERE reminder_id IN (SELECT id FROM cached_reminders WHERE user_id = ?)`,
    [userId],
  );
  return {
    fileUris: files.map((row) => row.local_uri),
    calendarEventIds: events.map((row) => row.calendar_event_id),
  };
}

export function wipeCachedDataForUser(userId: string) {
  const database = getDb();
  database.withTransactionSync(() => {
    // Child rows first - these two are keyed through their parent rows.
    database.runSync(
      `DELETE FROM downloaded_files
       WHERE document_id IN (SELECT id FROM cached_documents WHERE user_id = ?)`,
      [userId],
    );
    database.runSync(
      `DELETE FROM cached_calendar_syncs
       WHERE reminder_id IN (SELECT id FROM cached_reminders WHERE user_id = ?)`,
      [userId],
    );
    for (const table of [
      "cached_documents",
      "cached_folders",
      "cached_academic_info",
      "cached_document_requests",
      "cached_reminders",
      "cached_profile",
      "cached_subscription",
    ]) {
      database.runSync(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    }
  });
}
