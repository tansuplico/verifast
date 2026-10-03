export type DocumentRow = {
  id: string;
  folder_id: string;
  name: string;
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  icon_color: string | null;
  // Only fetched where it's needed (Home's "Recently Accessed" ordering).
  updated_at?: string | null;
  // Set for rows read from the local database; says whether a change on
  // this device is still waiting to reach Supabase.
  sync_status?:
    | "synced"
    | "pending_create"
    | "pending_update"
    | "pending_delete";
  // Why the last attempt to push this document was permanently rejected
  // (too large, wrong type, ...). Null when there's no such failure.
  sync_error?: string | null;
};
