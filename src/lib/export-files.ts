import { Directory, Paths } from "expo-file-system";

// Where Backup & Recovery drops the decrypted copy of a document just
// before handing it to the share sheet. These are real, readable copies of
// birth certificates, transcripts and the like, named after the document, so
// they shouldn't be left lying in the cache.
export function getExportsDir() {
  return new Directory(Paths.cache, "verifast-exports");
}

// Removes every exported copy. Deliberately NOT called right after
// shareAsync resolves: the receiving app may still be reading the file once
// the share sheet closes (Android in particular), so deleting then could
// break a share in progress. It's called at moments nothing can be mid-share
// instead - before the next export, on sign-out, on account deletion, and
// once at app launch.
//
// Files are deleted one by one, then the folder, so this doesn't depend on
// how Directory.delete() treats a non-empty folder. Best-effort: a failure
// is logged and never thrown, because it must not block the export, the
// sign-out, or the account wipe that calls it.
export function clearExportedFiles() {
  try {
    const dir = getExportsDir();
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      try {
        entry.delete();
      } catch (error) {
        console.error("Failed to delete exported file", error);
      }
    }
    dir.delete();
  } catch (error) {
    console.error("Failed to clear exported files", error);
  }
}
