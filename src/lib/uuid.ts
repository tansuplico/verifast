// Row IDs for records created while offline. Postgres normally assigns
// these (gen_random_uuid()), but a row that's created on the phone has to
// have its final ID before it ever reaches the server, so the same ID can
// be reused on every sync retry without creating duplicates.
//
// Uses crypto.getRandomValues when the runtime provides it, and falls back
// to Math.random otherwise. These are row identifiers scoped to one user by
// RLS, not secrets - a (vanishingly unlikely) collision would just make one
// insert fail, it can't expose anything - so no native module is needed.
export function uuidv4(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto;

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 version 4 / variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
