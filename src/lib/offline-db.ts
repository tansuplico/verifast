import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import type { AcademicInfoCategory } from "@/constants/academic-info-categories";
import type { DocumentRow } from "@/types/documents";

// Local read-through cache so Documents, Academic Info, and Search still
// show something when there's no connection - required for the app's rural
// / low-connectivity target users. This is metadata only (rows, not file
// bytes); see offline-files.ts for the actual downloaded document files.
// Scope is deliberately narrow: only what "View documents", "View academic
// info" and "Search" need. Nothing here is synced back up - it's a cache of
// what the server already returned, replaced wholesale on every successful
// online load.

let db: SQLiteDatabase | null = null;

function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync("verifast-offline-cache.db");
    db.execSync(`
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
        posted_at TEXT NOT NULL
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
  }
  return db;
}

export type CachedFolder = {
  id: string;
  name: string;
  category: string | null;
};

export type CachedAcademicInfoRow = {
  id: string;
  category: AcademicInfoCategory;
  title: string;
  content: string | null;
  is_pinned: boolean;
  posted_at: string;
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

// --- Academic info (Academic Info screen, Search) ---

export function cacheAcademicInfo(
  userId: string,
  items: CachedAcademicInfoRow[],
) {
  const database = getDb();
  database.withTransactionSync(() => {
    database.runSync("DELETE FROM cached_academic_info WHERE user_id = ?", [
      userId,
    ]);
    for (const item of items) {
      database.runSync(
        `INSERT INTO cached_academic_info
          (id, user_id, category, title, content, is_pinned, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          userId,
          item.category,
          item.title,
          item.content,
          item.is_pinned ? 1 : 0,
          item.posted_at,
        ],
      );
    }
  });
}

export function getCachedAcademicInfo(userId: string): CachedAcademicInfoRow[] {
  const rows = getDb().getAllSync<
    Omit<CachedAcademicInfoRow, "is_pinned"> & { is_pinned: number }
  >(
    "SELECT id, category, title, content, is_pinned, posted_at FROM cached_academic_info WHERE user_id = ? ORDER BY is_pinned DESC, posted_at DESC",
    [userId],
  );
  return rows.map((row) => ({ ...row, is_pinned: row.is_pinned === 1 }));
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
  const rows = getDb().getAllSync<
    Omit<CachedAcademicInfoRow, "is_pinned"> & { is_pinned: number }
  >(
    `SELECT id, category, title, content, is_pinned, posted_at
     FROM cached_academic_info
     WHERE user_id = ? AND title LIKE ? COLLATE NOCASE
     ORDER BY posted_at DESC LIMIT 8`,
    [userId, `%${query}%`],
  );
  return rows.map((row) => ({ ...row, is_pinned: row.is_pinned === 1 }));
}
