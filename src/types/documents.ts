export type DocumentRow = {
  id: string;
  folder_id: string;
  name: string;
  file_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};
