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
};
