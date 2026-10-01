import { checkIsOnline } from "@/hooks/use-network-status";
import { getDeviceId } from "@/lib/device-id";
import {
  cacheDocuments,
  cacheFolders,
  cacheProfile,
  cacheSubscription,
  discardReminder,
  getPendingAcademicInfo,
  getPendingCalendarSyncs,
  getPendingReminders,
  getPendingRequests,
  markAcademicInfoSynced,
  markCalendarSyncSynced,
  markReminderSynced,
  markRequestSynced,
  mergeServerAcademicInfo,
  mergeServerCalendarSyncs,
  mergeServerReminders,
  mergeServerRequests,
  removeDeletedAcademicInfo,
  removeDeletedCalendarSync,
  removeDeletedReminder,
  removeDeletedRequest,
  type PendingAcademicInfoRow,
  type PendingCalendarSyncRow,
  type PendingReminderRow,
  type PendingRequestRow,
} from "@/lib/offline-db";
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
  // Profile, plan, folders and documents - read-only copies, nothing to push.
  accountOk: boolean;
};

function allOk(result: FullSyncResult) {
  return (
    result.academicInfoOk &&
    result.requestsOk &&
    result.remindersOk &&
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

// --- Account data (read-only: profile, plan, folders, documents) ---
//
// Nothing here is edited offline, so there's nothing to push - this just
// keeps the on-device copies fresh so Home, Profile and the Free-plan
// check can run without a connection. Documents and folders replace the
// cache wholesale, exactly like the Documents screen's own load does.

export async function refreshAccountData(userId: string): Promise<boolean> {
  if (!(await checkIsOnline())) return false;

  let ok = true;

  const [profileResult, subscriptionResult, foldersResult, documentsResult] =
    await Promise.all([
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
      supabase
        .from("folders")
        .select("id, category, name")
        .eq("user_id", userId),
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

  if (foldersResult.error || documentsResult.error) {
    ok = false;
    console.warn(
      "[sync] failed to pull documents",
      foldersResult.error ?? documentsResult.error,
    );
  } else {
    cacheFolders(userId, foldersResult.data ?? []);
    cacheDocuments(userId, documentsResult.data ?? []);
  }

  notifyListeners();
  return ok;
}

// --- Orchestration ---

async function runSync(userId: string): Promise<FullSyncResult> {
  if (!(await checkIsOnline())) {
    return {
      academicInfoOk: false,
      requestsOk: false,
      remindersOk: false,
      accountOk: false,
    };
  }

  // One table failing (even unexpectedly) never stops the other.
  let academicInfoOk = false;
  let requestsOk = false;
  let remindersOk = false;
  let accountOk = false;

  try {
    academicInfoOk = await syncAcademicInfoTable(userId);
  } catch (error) {
    console.warn("[sync] unexpected academic info error", error);
  }
  try {
    requestsOk = await syncRequestsTable(userId);
  } catch (error) {
    console.warn("[sync] unexpected document requests error", error);
  }
  try {
    remindersOk = await syncRemindersTable(userId);
  } catch (error) {
    console.warn("[sync] unexpected reminders error", error);
  }
  try {
    accountOk = await refreshAccountData(userId);
  } catch (error) {
    console.warn("[sync] unexpected account data error", error);
  }

  notifyListeners();
  return { academicInfoOk, requestsOk, remindersOk, accountOk };
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
let lastRun: {
  userId: string;
  finishedAt: number;
  result: FullSyncResult;
} | null = null;

export function syncAll(
  userId: string,
  options: { force?: boolean } = {},
): Promise<FullSyncResult> {
  if (inFlight) {
    if (options.force) rerunRequested = true;
    return inFlight;
  }

  if (
    !options.force &&
    lastRun &&
    lastRun.userId === userId &&
    allOk(lastRun.result) &&
    Date.now() - lastRun.finishedAt < COOLDOWN_MS
  ) {
    return Promise.resolve(lastRun.result);
  }

  inFlight = (async () => {
    let result: FullSyncResult = {
      academicInfoOk: true,
      requestsOk: true,
      remindersOk: true,
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
