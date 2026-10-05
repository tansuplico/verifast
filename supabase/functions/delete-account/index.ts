import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Every bucket the app uploads user files into. Both key their objects as
// `${userId}/<file>` (see add-document-modal.tsx and edit-profile.tsx).
const USER_FILE_BUCKETS = ["documents", "avatars"] as const;

// Storage's list() returns at most this many entries per call (100 is its
// server-side default).
const LIST_PAGE_SIZE = 100;
// Hard stop so a misbehaving remove() can never turn into an endless loop.
// 200 pages x 100 files = 20,000 files per bucket, far beyond any real user.
const MAX_PAGES = 200;

// Supabase refuses to delete an auth user who still owns Storage objects,
// so the files have to go first - and through the Storage API, so the
// actual stored bytes are removed along with the metadata rows.
//
// Always re-lists from offset 0: each pass removes what it just listed, so
// the next pass sees the next batch. Paging with an advancing offset would
// skip files as the list shrinks underneath it.
async function emptyUserFolder(
  admin: SupabaseClient,
  bucket: string,
  userId: string,
) {
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data: entries, error: listError } = await admin.storage
      .from(bucket)
      .list(userId, { limit: LIST_PAGE_SIZE, offset: 0 });
    if (listError) throw new Error(`list ${bucket}: ${listError.message}`);

    // Folder entries come back with a null id; this app only ever writes
    // flat files directly under the user's folder, so only files matter.
    const files = (entries ?? []).filter((entry) => entry.id !== null);
    if (files.length === 0) return;

    const { data: removed, error: removeError } = await admin.storage
      .from(bucket)
      .remove(files.map((file) => `${userId}/${file.name}`));
    if (removeError)
      throw new Error(`remove ${bucket}: ${removeError.message}`);
    if (!removed || removed.length === 0) {
      throw new Error(`remove ${bucket}: nothing was removed`);
    }
  }
  throw new Error(`${bucket}: too many files to remove in one request`);
}

Deno.serve(async (req) => {
  try {
    // verify_jwt=true (set in config.toml) already rejects requests without
    // a valid token; this resolves *which* user it is. The user id is never
    // taken from the request body - a caller can only ever delete themself.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") ?? "" },
      },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Files first. If anything fails here we stop *before* touching the
    // account, so the account is intact and the user can simply retry.
    // This is not fully atomic, though: if the files are removed and the
    // final deleteUser() below then fails, the account survives with its
    // database rows but without its files until the retry. Re-running is
    // safe either way (an already-emptied folder just lists nothing).
    for (const bucket of USER_FILE_BUCKETS) {
      await emptyUserFolder(admin, bucket, user.id);
    }

    // Hard delete (the default). Cascades to every public table that
    // references auth.users (profiles, folders, documents, reminders,
    // document_requests, academic_info, subscriptions, calendar syncs) and
    // to the user's auth sessions and refresh tokens. Payments are
    // one-time PayMongo checkouts, so there is no recurring billing to stop.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("delete-account: deleteUser failed", deleteError);
      return new Response(JSON.stringify({ error: "Account delete failed" }), {
        status: 500,
      });
    }

    return new Response(JSON.stringify({ deleted: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-account: unhandled error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
