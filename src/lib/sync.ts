import { checkIsOnline } from "@/hooks/use-network-status";
import { getDeviceId } from "@/lib/device-id";
import {
  cacheFolders,
  cacheProfile,
  cacheSubscription,
  discardDocument,
  discardReminder,
  getPendingAcademicInfo,
  getPendingCalendarSyncs,
  getPendingDocuments,
  getPendingReminders,
  getPendingRequests,
  markAcademicInfoSynced,
  markCalendarSyncSynced,
  markDocumentFileUploaded,
  markDocumentSynced,
  markReminderSynced,
  markRequestSynced,
  markSyncFailed,
  mergeServerAcademicInfo,
  mergeServerCalendarSyncs,
  mergeServerDocuments,
  mergeServerReminders,
  mergeServerRequests,
  removeDeletedAcademicInfo,
  removeDeletedCalendarSync,
  removeDeletedDocument,
  removeDeletedReminder,
  removeDeletedRequest,
  type PendingAcademicInfoRow,
  type PendingCalendarSyncRow,
  type PendingDocumentRow,
  type PendingReminderRow,
  type PendingRequestRow,
  type SyncableTable,
} from "@/lib/offline-db";
import { readOfflineFile, removeOfflineFile } from "@/lib/offline-files";
import { supabase } from "@/lib/supabase";

// Pushes changes made on this device (offline or not) up to Supabase, then
// pulls the server's current rows back down. The UI never waits on this -
// screens read and write the local database directly, and this runs in the
// background whenever a connection is available.
//
// Each table follows the same steps: push pending rows oldest-first
// (creates, then updates, then deletes), then pull and merge. Creates and
// updates both go through upsert on the client-generated id, so a retry
// after a lost response just overwrites the same row instead of failing or
// duplicating it.

export type SyncResult = { ok: boolean };
type FullSyncResult = {
  academicInfoOk: boolean;
  requestsOk: boolean;
  remindersOk: boolean;
  documentsOk: boolean;
  // Profile, plan and folders - read-only copies, nothing to push.
  accountOk: boolean;
};

export function allSyncOk(result: FullSyncResult) {
  return (
    result.academicInfoOk &&
    result.requestsOk &&
    result.remindersOk &&
    result.documentsOk &&
    result.accountOk
  );
}

type Listener = () => void;
const listeners = new Set<Listener>();

// Screens subscribe so they can re-read local data once a sync has changed
// it (a "waiting to sync" badge clearing, rows pulled from another device).
export function subscribeToSync(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

// --- Telling "try again later" from "this will never work" ---
//
// Most push failures are the connection (or an expired session) and simply
// retry on the next sync. A few mean the server will refuse this exact row
// no matter how often it is sent: a file over the size limit or of a type
// the bucket doesn't allow, a row that points at a folder that no longer
// exists, a rejected value. Retrying those forever just burns battery and
// hides the problem, so they're recorded on the row (markSyncFailed) and
// shown to the user instead.

type ErrorLike = {
  code?: string;
  status?: number;
  statusCode?: string;
  message?: string;
  // Set on the errors this file creates itself (a local file that's gone).
  permanent?: boolean;
};

function isPermanentError(error: unknown): boolean {
  const e = error as ErrorLike;
  if (e.permanent) return true;
  // Postgres: data errors (22), integrity violations (23) and permission or
  // syntax errors (42) are all about the row itself, not the connection.
  if (typeof e.code === "string" && /^(22|23|42)/.test(e.code)) return true;
  // Storage reports "too large" / "unsupported type" as 413 / 415, either as
  // the HTTP status or in the body's statusCode.
  const statuses = [e.status, Number(e.statusCode)];
  if (statuses.includes(413) || statuses.includes(415)) return true;
  if (
    typeof e.code === "string" &&
    /EntityTooLarge|InvalidMimeType/i.test(e.code)
  ) {
    return true;
  }
  return false;
}

function describeError(error: unknown): string {
  const e = error as ErrorLike;
  const statuses = [e.status, Number(e.statusCode)];
  if (statuses.includes(413) || e.code === "EntityTooLarge") {
    return "This file is too large to upload.";
  }
  if (statuses.includes(415) || e.code === "InvalidMimeType") {
    return "This file type isn't allowed.";
  }
  if (e.code === "23503") {
    return "The folder or document this belongs to no longer exists.";
  }
  if (e.code === "42501") {
    return "Your account isn't allowed to save this.";
  }
  return e.message ?? "The server rejected this change.";
}

// Records a permanent failure on the row. Returns true if it was one (the
// caller then moves on without treating the sync as broken).
function rejectedForGood(
  table: SyncableTable,
  id: string,
  localRev: number,
  error: unknown,
): boolean {
  if (!isPermanentError(error)) return false;
  console.warn("[sync] rejected for good", table, id, error);
  markSyncFailed(table, id, localRev, describeError(error));
  return true;
}

// --- Academic info ---

async function pushAcademicInfoRow(
  userId: string,
  row: PendingAcademicInfoRow,
) {
  if (row.sync_status === "pending_delete") {
    // Deleting a row the server doesn't have (already deleted elsewhere)
    // isn't an error, it just matches zero rows.
    const { error } = await supabase
      .from("academic_info")
      .delete()
      .eq("id", row.id);
    if (error) return error;
    removeDeletedAcademicInfo(row.id, row.local_rev);
    return null;
  }

  const { error } = await supabase.from("academic_info").upsert(
    {
      id: row.id,
      user_id: userId,
      category: row.category,
      title: row.title,
      content: row.content,
      is_pinned: row.is_pinned,
      posted_at: row.posted_at,
    },
    { onConflict: "id" },
  );
  if (error) return error;
  markAcademicInfoSynced(row.id, row.local_rev);
  return null;
}

async function syncAcademicInfoTable(userId: string): Promise<boolean> {
  let ok = true;

  for (const row of getPendingAcademicInfo(userId)) {
    const error = await pushAcademicInfoRow(userId, row);
    if (!error) continue;
    if (rejectedForGood("cached_academic_info", row.id, row.local_rev, error)) {
      continue;
    }

    ok = false;
    console.warn("[sync] failed to push academic info row", row.id, error);
    // Lost the connection mid-run: stop here, the rest stays pending and
    // goes out on the next reconnect. A rejection while still online only
    // skips that one row, so it can't block everything queued behind it.
    if (!(await checkIsOnline())) return false;
  }

  // Safe even with pushes that failed above - the merge leaves any row
  // with pending local changes untouched.
  const { data, error } = await supabase
    .from("academic_info")
    .select("id, category, title, content, is_pinned, posted_at")
    .eq("user_id", userId);

  if (error) {
    console.warn("[sync] failed to pull academic info", error);
    return false;
  }
  mergeServerAcademicInfo(userId, data ?? []);
  return ok;
}

// --- Document requests ---

async function pushRequestRow(userId: string, row: PendingRequestRow) {
  if (row.sync_status === "pending_delete") {
    const { error } = await supabase
      .from("document_requests")
      .delete()
      .eq("id", row.id);
    if (error) return error;
    removeDeletedRequest(row.id, row.local_rev);
    return null;
  }

  // Only the columns this app edits are sent. Upsert updates just the
  // columns present in the payload, so fields the app never touches
  // (notes, expected_release_date) are left as they are on the server.
  const { error } = await supabase.from("document_requests").upsert(
    {
      id: row.id,
      user_id: userId,
      document_type: row.document_type,
      office: row.office,
      status: row.status,
      requested_date: row.requested_date,
      released_date: row.released_date,
      created_at: row.created_at,
    },
    { onConflict: "id" },
  );
  if (error) return error;
  markRequestSynced(row.id, row.local_rev);
  return null;
}

async function syncRequestsTable(userId: string): Promise<boolean> {
  let ok = true;

  for (const row of getPendingRequests(userId)) {
    const error = await pushRequestRow(userId, row);
    if (!error) continue;
    if (
      rejectedForGood("cached_document_requests", row.id, row.local_rev, error)
    ) {
      continue;
    }

    ok = false;
    console.warn("[sync] failed to push document request", row.id, error);
    if (!(await checkIsOnline())) return false;
  }

  const { data, error } = await supabase
    .from("document_requests")
    .select(
      "id, document_type, office, status, requested_date, released_date, created_at",
    )
    .eq("user_id", userId);

  if (error) {
    console.warn("[sync] failed to pull document requests", error);
    return false;
  }
  mergeServerRequests(userId, data ?? []);
  return ok;
}

// --- Reminders (and this device's calendar event per reminder) ---

async function pushReminderRow(userId: string, row: PendingReminderRow) {
  if (row.sync_status === "pending_delete") {
    // The server also deletes the reminder's calendar sync rows (cascade).
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", row.id);
    if (error) return error;
    removeDeletedReminder(row.id, row.local_rev);
    return null;
  }

  if (row.sync_status === "pending_create") {
    // `type` is a required legacy column with no default; the app has
    // always written "submission" for new reminders.
    const { error } = await supabase.from("reminders").upsert(
      {
        id: row.id,
        user_id: userId,
        title: row.title,
        category: row.category,
        type: "submission",
        due_date: row.due_date,
      },
      { onConflict: "id" },
    );
    if (error) return error;
    markReminderSynced(row.id, row.local_rev);
    return null;
  }

  // An edit goes through update, not upsert: an upsert would also write
  // `type` and overwrite whatever value the row already has.
  const { data, error } = await supabase
    .from("reminders")
    .update({
      title: row.title,
      category: row.category,
      due_date: row.due_date,
    })
    .eq("id", row.id)
    .select("id");
  if (error) return error;

  if (!data || data.length === 0) {
    // Nothing matched: the reminder was deleted on another device, so
    // drop the local copy instead of retrying forever.
    discardReminder(row.id, row.local_rev);
    return null;
  }
  markReminderSynced(row.id, row.local_rev);
  return null;
}

async function pushCalendarSyncRow(
  deviceId: string,
  row: PendingCalendarSyncRow,
) {
  if (row.sync_status === "pending_delete") {
    const { error } = await supabase
      .from("reminder_calendar_syncs")
      .delete()
      .eq("reminder_id", row.reminder_id)
      .eq("device_id", deviceId);
    if (error) return error;
    removeDeletedCalendarSync(row.reminder_id, deviceId, row.local_rev);
    return null;
  }

  const { error } = await supabase.from("reminder_calendar_syncs").upsert(
    {
      reminder_id: row.reminder_id,
      device_id: deviceId,
      calendar_event_id: row.calendar_event_id,
    },
    { onConflict: "reminder_id,device_id" },
  );
  if (error) return error;
  markCalendarSyncSynced(row.reminder_id, deviceId, row.local_rev);
  return null;
}

async function syncRemindersTable(userId: string): Promise<boolean> {
  let ok = true;

  // Reminders go first: a calendar sync row can't be inserted on the
  // server until the reminder it points at exists there.
  for (const row of getPendingReminders(userId)) {
    const error = await pushReminderRow(userId, row);
    if (!error) continue;
    if (rejectedForGood("cached_reminders", row.id, row.local_rev, error)) {
      continue;
    }

    ok = false;
    console.warn("[sync] failed to push reminder", row.id, error);
    if (!(await checkIsOnline())) return false;
  }

  const { data, error } = await supabase
    .from("reminders")
    .select("id, title, due_date, category")
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) {
    console.warn("[sync] failed to pull reminders", error);
    return false;
  }
  mergeServerReminders(userId, data ?? []);

  const deviceId = await getDeviceId();

  for (const row of getPendingCalendarSyncs(deviceId)) {
    const syncError = await pushCalendarSyncRow(deviceId, row);
    if (!syncError) continue;

    ok = false;
    console.warn(
      "[sync] failed to push calendar sync",
      row.reminder_id,
      syncError,
    );
    if (!(await checkIsOnline())) return false;
  }

  const { data: syncs, error: syncsError } = await supabase
    .from("reminder_calendar_syncs")
    .select("reminder_id, calendar_event_id")
    .eq("device_id", deviceId);

  if (syncsError) {
    console.warn("[sync] failed to pull calendar syncs", syncsError);
    return false;
  }
  mergeServerCalendarSyncs(deviceId, syncs ?? []);
  return ok;
}

// --- Account data (read-only: profile, plan, folders) ---
//
// Nothing here is edited offline, so there's nothing to push - this just
// keeps the on-device copies fresh so Home, Profile and the Free-plan
// check can run without a connection. Folders replace the cache wholesale;
// documents have their own table sync below because they can be edited
// offline.

export async function refreshAccountData(userId: string): Promise<boolean> {
  if (!(await checkIsOnline())) return false;

  let ok = true;

  const [profileResult, subscriptionResult, foldersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, student_id, program, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at, current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("folders").select("id, category, name").eq("user_id", userId),
    supabase
      .from("documents")
      .select(
        "id, folder_id, name, file_path, mime_type, file_size, created_at, icon_color, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error) {
    ok = false;
    console.warn("[sync] failed to pull profile", profileResult.error);
  } else {
    cacheProfile(userId, profileResult.data);
  }

  if (subscriptionResult.error) {
    ok = false;
    console.warn(
      "[sync] failed to pull subscription",
      subscriptionResult.error,
    );
  } else {
    cacheSubscription(userId, subscriptionResult.data);
  }

  if (foldersResult.error) {
    ok = false;
    console.warn("[sync] failed to pull folders", foldersResult.error);
  } else {
    cacheFolders(userId, foldersResult.data ?? []);
  }

  notifyListeners();
  return ok;
}

// --- Documents ---
//
// Adding a document uploads its file and then creates the row; rename, move
// and recolor are updates; delete removes the stored file and then the row.

// A document added on this device: its file goes to storage first, then
// the row is created. Both steps are safe to repeat - the upload overwrites
// the same path, the row is an upsert on the id picked at queue time - and
// file_uploaded remembers the first step so a failure in the second doesn't
// send a large file up a second time.
async function pushNewDocument(userId: string, row: PendingDocumentRow) {
  if (!row.file_uploaded) {
    const bytes = await readOfflineFile(row.id);
    if (!bytes || !row.file_path) {
      // The local copy is gone (app storage was cleared), so there is
      // nothing left to upload - this will never succeed.
      return {
        permanent: true,
        message:
          "The file is no longer on this device, so it can't be uploaded.",
      };
    }

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(row.file_path, bytes, {
        contentType: row.mime_type ?? undefined,
        upsert: true,
      });
    if (uploadError) return uploadError;
    markDocumentFileUploaded(row.id);
  }

  const { error } = await supabase.from("documents").upsert(
    {
      id: row.id,
      user_id: userId,
      folder_id: row.folder_id,
      name: row.name,
      file_path: row.file_path,
      mime_type: row.mime_type,
      file_size: row.file_size,
      created_at: row.created_at,
    },
    { onConflict: "id" },
  );
  if (error) return error;

  markDocumentSynced(row.id, row.local_rev);
  return null;
}

async function pushDocumentRow(userId: string, row: PendingDocumentRow) {
  if (row.sync_status === "pending_create") {
    return pushNewDocument(userId, row);
  }

  if (row.sync_status === "pending_delete") {
    // File first: if this fails the row stays pending and the whole delete
    // retries, instead of leaving a file with no row pointing at it.
    // Removing a file that's already gone isn't an error.
    if (row.file_path) {
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([row.file_path]);
      if (storageError) return storageError;
    }
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", row.id);
    if (error) return error;
    removeDeletedDocument(row.id, row.local_rev);
    return null;
  }

  const { data, error } = await supabase
    .from("documents")
    .update({
      name: row.name,
      folder_id: row.folder_id,
      icon_color: row.icon_color,
    })
    .eq("id", row.id)
    .select("id");
  if (error) return error;

  if (!data || data.length === 0) {
    // Nothing matched: the document was deleted on another device, so drop
    // the local copy (and its downloaded file) instead of retrying forever.
    removeOfflineFile(row.id);
    discardDocument(row.id, row.local_rev);
    return null;
  }
  markDocumentSynced(row.id, row.local_rev);
  return null;
}

async function syncDocumentsTable(userId: string): Promise<boolean> {
  let ok = true;

  for (const row of getPendingDocuments(userId)) {
    // A big upload can take a while - don't start the next one if the
    // account is being deleted underneath it.
    if (suspended) return false;

    const error = await pushDocumentRow(userId, row);
    if (!error) continue;
    if (rejectedForGood("cached_documents", row.id, row.local_rev, error)) {
      continue;
    }

    ok = false;
    console.warn("[sync] failed to push document", row.id, error);
    if (!(await checkIsOnline())) return false;
  }

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, folder_id, name, file_path, mime_type, file_size, created_at, icon_color, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[sync] failed to pull documents", error);
    return false;
  }
  mergeServerDocuments(userId, data ?? []);
  return ok;
}

// --- Orchestration ---

const NOTHING_SYNCED: FullSyncResult = {
  academicInfoOk: false,
  requestsOk: false,
  remindersOk: false,
  documentsOk: false,
  accountOk: false,
};

async function runSync(userId: string): Promise<FullSyncResult> {
  if (suspended || !(await checkIsOnline())) {
    return NOTHING_SYNCED;
  }

  // One table failing (even unexpectedly) never stops the other.
  let academicInfoOk = false;
  let requestsOk = false;
  let remindersOk = false;
  let documentsOk = false;
  let accountOk = false;

  try {
    academicInfoOk = await syncAcademicInfoTable(userId);
  } catch (error) {
    console.warn("[sync] unexpected academic info error", error);
  }
  if (suspended) return NOTHING_SYNCED;
  try {
    requestsOk = await syncRequestsTable(userId);
  } catch (error) {
    console.warn("[sync] unexpected document requests error", error);
  }
  if (suspended) return NOTHING_SYNCED;
  try {
    remindersOk = await syncRemindersTable(userId);
  } catch (error) {
    console.warn("[sync] unexpected reminders error", error);
  }
  if (suspended) return NOTHING_SYNCED;
  try {
    accountOk = await refreshAccountData(userId);
  } catch (error) {
    console.warn("[sync] unexpected account data error", error);
  }
  // Documents go last: an upload can take a while on a slow connection, and
  // the small stuff above shouldn't wait behind it.
  if (suspended) return NOTHING_SYNCED;
  try {
    documentsOk = await syncDocumentsTable(userId);
  } catch (error) {
    console.warn("[sync] unexpected documents error", error);
  }

  notifyListeners();
  return { academicInfoOk, requestsOk, remindersOk, documentsOk, accountOk };
}

// One sync at a time. A forced request that arrives mid-sync (say, the user
// saves again while a push is in flight) is folded into one follow-up run
// instead of starting a second overlapping one. Plain requests - a screen
// coming into focus - just join whatever is already running.
//
// Screens also share a short cooldown: switching between tabs would
// otherwise run a full sync (a dozen queries) on every focus. Anything
// that has local changes to push, or a reason to refresh right now
// (reconnect, app foreground, pull-to-refresh), passes force and always runs.
const COOLDOWN_MS = 15_000;

let inFlight: Promise<FullSyncResult> | null = null;
let rerunRequested = false;
let suspended = false;
let lastRun: {
  userId: string;
  finishedAt: number;
  result: FullSyncResult;
} | null = null;

// Stops all syncing and waits for a run that is already underway to finish.
// For account deletion: a sync that is still pulling when the local data is
// wiped could write the old rows straight back into the database, leaving
// a deleted user's data on the device. Call the returned function to
// resume (it must always be called, including after a successful delete,
// or the next account to sign in on this device would never sync).
export async function suspendSync(): Promise<() => void> {
  suspended = true;
  rerunRequested = false;
  if (inFlight) {
    try {
      await inFlight;
    } catch {
      // runSync handles its own errors; nothing to do if it somehow threw.
    }
  }
  return () => {
    suspended = false;
  };
}

export function syncAll(
  userId: string,
  options: { force?: boolean } = {},
): Promise<FullSyncResult> {
  if (suspended) return Promise.resolve(NOTHING_SYNCED);

  if (inFlight) {
    if (options.force) rerunRequested = true;
    return inFlight;
  }

  if (
    !options.force &&
    lastRun &&
    lastRun.userId === userId &&
    allSyncOk(lastRun.result) &&
    Date.now() - lastRun.finishedAt < COOLDOWN_MS
  ) {
    return Promise.resolve(lastRun.result);
  }

  inFlight = (async () => {
    let result: FullSyncResult = {
      academicInfoOk: true,
      requestsOk: true,
      remindersOk: true,
      documentsOk: true,
      accountOk: true,
    };
    try {
      do {
        rerunRequested = false;
        result = await runSync(userId);
      } while (
        rerunRequested &&
        (result.academicInfoOk ||
          result.requestsOk ||
          result.remindersOk ||
          result.documentsOk ||
          result.accountOk)
      );
      lastRun = { userId, finishedAt: Date.now(), result };
    } finally {
      inFlight = null;
    }
    return result;
  })();

  return inFlight;
}

// Per-screen views of the same sync: each screen only cares whether its
// own table made it.
export async function syncAcademicInfo(
  userId: string,
  force = false,
): Promise<SyncResult> {
  const result = await syncAll(userId, { force });
  return { ok: result.academicInfoOk };
}

export async function syncRequests(
  userId: string,
  force = false,
): Promise<SyncResult> {
  const result = await syncAll(userId, { force });
  return { ok: result.requestsOk };
}

export async function syncDocuments(
  userId: string,
  force = false,
): Promise<SyncResult> {
  const result = await syncAll(userId, { force });
  // The Documents screen shows folders too, which come from account data.
  return { ok: result.documentsOk && result.accountOk };
}

export async function syncReminders(
  userId: string,
  force = false,
): Promise<SyncResult> {
  const result = await syncAll(userId, { force });
  return { ok: result.remindersOk };
}

// Fire-and-forget version for call sites that just changed local data and
// want it pushed as soon as possible (e.g. right after a save).
export function requestSync(userId: string) {
  void syncAll(userId, { force: true });
}
