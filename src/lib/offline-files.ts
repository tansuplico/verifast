import { Directory, File, Paths } from "expo-file-system";

import {
  forgetDownloadedFile,
  getLocalFileUri,
  recordDownloadedFile,
} from "@/lib/offline-db";

// Downloaded document files live under the app's persistent documents
// directory (Paths.document), not Paths.cache - the cache directory can be
// cleared by the OS under storage pressure at any time, which would silently
// break "available offline" for something the user was relying on.
const OFFLINE_DOCS_DIR = new Directory(Paths.document, "verifast-offline-docs");

function ensureDir() {
  if (!OFFLINE_DOCS_DIR.exists) {
    OFFLINE_DOCS_DIR.create({ intermediates: true, idempotent: true });
  }
}

// Returns a local file:// URI if this document was already downloaded and
// the file is still actually present on disk (it can vanish if the user
// clears app storage outright, even from the documents directory - so this
// double-checks rather than trusting the DB row alone).
export function getOfflineFileUri(documentId: string): string | null {
  const uri = getLocalFileUri(documentId);
  if (!uri) return null;
  if (!new File(uri).exists) {
    forgetDownloadedFile(documentId);
    return null;
  }
  return uri;
}

// Downloads a document's current signed URL to local storage for offline
// viewing later. Called after a normal (online) view already succeeded, so
// this is "cache what was just opened", not a bulk pre-download of every
// document - downloading everything up front would be a real, uncontrolled
// storage/bandwidth cost for what's meant to be a lightweight document
// store. Failures here are swallowed: this is a background nicety, and the
// document still opened fine live either way.
export async function cacheDocumentFileForOffline(
  documentId: string,
  signedUrl: string,
  fileName: string,
): Promise<void> {
  try {
    if (getOfflineFileUri(documentId)) return;
    ensureDir();
    const destination = new File(OFFLINE_DOCS_DIR, `${documentId}-${fileName}`);
    const downloaded = await File.downloadFileAsync(signedUrl, destination);
    recordDownloadedFile(documentId, downloaded.uri);
  } catch (error) {
    console.error("Failed to cache document for offline use", error);
  }
}
