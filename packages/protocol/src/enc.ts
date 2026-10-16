// The one encoding every signed and sealed structure uses.
import { concatBytes, utf8Encode } from "./bytes";

/** `enc(label, f1, ..., fn) = label_ascii || u32be(len f1) || f1 || ... || u32be(len fn) || fn`. */
export function enc(label: string, fields: Uint8Array[]): Uint8Array {
  const parts = [utf8Encode(label)];
  for (const f of fields) {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, f.length);
    parts.push(len, f);
  }
  return concatBytes(...parts);
}

/** The inverse of `enc`: the fields, if `bytes` starts with exactly `label` and the
 *  length-prefixed fields then use up the whole input; otherwise null. */
export function dec(label: string, bytes: Uint8Array): Uint8Array[] | null {
  const prefix = utf8Encode(label);
  if (bytes.length < prefix.length) return null;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields: Uint8Array[] = [];
  let at = prefix.length;
  while (at < bytes.length) {
    if (bytes.length - at < 4) return null;
    const len = view.getUint32(at);
    at += 4;
    if (len > bytes.length - at) return null;
    fields.push(bytes.slice(at, at + len));
    at += len;
  }
  return fields;
}
