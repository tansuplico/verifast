import { decode } from "base64-arraybuffer";
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

// Removes the local copy of a document's file (and its record) - used when
// the document itself is deleted, so a deleted document's file doesn't sit
// on the phone taking up space. Best-effort: a missing file is fine.
export function removeOfflineFile(documentId: string) {
  const uri = getLocalFileUri(documentId);
  if (uri) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (error) {
      console.error("Failed to delete offline file", error);
    }
  }
  forgetDownloadedFile(documentId);
}

// Copies a freshly picked file into persistent app storage so it can be
// uploaded later - the picker's own copy lives in the cache directory, which
// the OS may clear at any time, and an upload queued while offline can wait
// a long while. The copy also doubles as the document's offline copy, so a
// document you just added opens without a connection. Returns the copy's
// real size, which is more trustworthy than what the picker reported.
export async function copyPickedFileForUpload(
  documentId: string,
  extension: string,
  source: { uri: string; base64?: string },
): Promise<{ uri: string; size: number | null }> {
  ensureDir();
  const destination = new File(OFFLINE_DOCS_DIR, `${documentId}.${extension}`);

  try {
    await new File(source.uri).copy(destination, { overwrite: true });
  } catch (copyError) {
    // Some pickers hand back a URI that can't be copied directly; the photo
    // pickers also return the image's bytes, which is a fine fallback.
    if (!source.base64) throw copyError;
    if (!destination.exists) destination.create({ intermediates: true });
    destination.write(new Uint8Array(decode(source.base64)));
  }

  return { uri: destination.uri, size: destination.size ?? null };
}

// The bytes of a document's local copy, for uploading. Null if the file is
// gone (the user cleared the app's storage).
export async function readOfflineFile(
  documentId: string,
): Promise<ArrayBuffer | null> {
  const uri = getOfflineFileUri(documentId);
  if (!uri) return null;
  return new File(uri).arrayBuffer();
}

// Removes a copy made by copyPickedFileForUpload that never got as far as a
// database row (the file turned out to be over the size limit, say).
export function discardCopiedFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    console.error("Failed to discard copied file", error);
  }
}
