import { checkIsOnline } from "@/hooks/use-network-status";
import {
  getPendingAcademicInfo,
  markAcademicInfoSynced,
  mergeServerAcademicInfo,
  removeDeletedAcademicInfo,
  type PendingAcademicInfoRow,
} from "@/lib/offline-db";
import { supabase } from "@/lib/supabase";

// Pushes academic info changes made on this device (offline or not) up to
// Supabase, then pulls the server's current rows back down. The UI never
// waits on this - screens read and write the local database directly, and
// this runs in the background whenever a connection is available.

export type SyncResult = { ok: boolean };

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

async function pushRow(userId: string, row: PendingAcademicInfoRow) {
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

  // Creates and updates both go through upsert on the client-generated id:
  // if a previous attempt reached the server but the response was lost, the
  // retry just overwrites the same row instead of failing or duplicating.
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

async function runSync(userId: string): Promise<SyncResult> {
  if (!(await checkIsOnline())) return { ok: false };

  let ok = true;

  try {
    for (const row of getPendingAcademicInfo(userId)) {
      const error = await pushRow(userId, row);
      if (!error) continue;

      ok = false;
      console.warn("[sync] failed to push academic info row", row.id, error);
      // Lost the connection mid-run: stop here, the rest stays pending and
      // goes out on the next reconnect. A rejection while still online only
      // skips that one row, so it can't block everything queued behind it.
      if (!(await checkIsOnline())) break;
    }

    // Safe even with pushes that failed above - the merge leaves any row
    // with pending local changes untouched.
    const { data, error } = await supabase
      .from("academic_info")
      .select("id, category, title, content, is_pinned, posted_at")
      .eq("user_id", userId);

    if (error) {
      ok = false;
      console.warn("[sync] failed to pull academic info", error);
    } else {
      mergeServerAcademicInfo(userId, data ?? []);
    }
  } catch (error) {
    ok = false;
    console.warn("[sync] unexpected error", error);
  }

  notifyListeners();
  return { ok };
}

// One sync at a time. A request that arrives mid-sync (say, the user saves
// again while a push is in flight) is folded into one follow-up run instead
// of starting a second overlapping one.
let inFlight: Promise<SyncResult> | null = null;
let rerunRequested = false;

export function syncAcademicInfo(userId: string): Promise<SyncResult> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }

  inFlight = (async () => {
    let result: SyncResult = { ok: true };
    try {
      do {
        rerunRequested = false;
        result = await runSync(userId);
      } while (rerunRequested && result.ok);
    } finally {
      inFlight = null;
    }
    return result;
  })();

  return inFlight;
}

// Fire-and-forget version for call sites that just changed local data and
// want it pushed as soon as possible (e.g. right after a save).
export function requestSync(userId: string) {
  void syncAcademicInfo(userId);
}
