// Byte helpers written by hand, so they behave the same on Hermes (which has no
// reliable TextDecoder) as in Node: hex, strict unpadded base64url, UTF-8, and
// percent coding.

const HEX = "0123456789abcdef";

/** Lower-case hex. */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

/** Hex in either case; throws on anything else. */
export function fromHex(text: string): Uint8Array {
  if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text)) throw new Error("invalid hex");
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(text.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Unpadded base64url, as control messages and QR codes carry bytes. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) out += B64[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

/** Strict unpadded base64url: no padding, no other alphabet, and the unused
 *  trailing bits zero (so each byte string has exactly one encoding). */
export function base64UrlDecode(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 6) / 8));
  let acc = 0;
  let bits = 0;
  let at = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
    }
  }
  if ((acc & ((1 << bits) - 1)) !== 0) return null;
  return out;
}

/** UTF-8, with a lone surrogate written as U+FFFD (as TextEncoder does). */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** UTF-8 with each maximal invalid subpart replaced by U+FFFD (the WHATWG
 *  decoder, and Rust's String::from_utf8_lossy), so a valid byte after a bad
 *  one is never swallowed. Never throws. */
export function utf8DecodeLossy(bytes: Uint8Array): string {
  const points: number[] = [];
  let needed = 0;
  let seen = 0;
  let point = 0;
  let lower = 0x80;
  let upper = 0xbf;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (needed === 0) {
      if (b <= 0x7f) points.push(b);
      else if (b >= 0xc2 && b <= 0xdf) {
        needed = 1;
        point = b & 0x1f;
      } else if (b >= 0xe0 && b <= 0xef) {
        if (b === 0xe0) lower = 0xa0;
        if (b === 0xed) upper = 0x9f;
        needed = 2;
        point = b & 0xf;
      } else if (b >= 0xf0 && b <= 0xf4) {
        if (b === 0xf0) lower = 0x90;
        if (b === 0xf4) upper = 0x8f;
        needed = 3;
        point = b & 7;
      } else points.push(0xfffd);
      continue;
    }
    if (b < lower || b > upper) {
      // The sequence so far is one invalid subpart; read this byte afresh.
      needed = seen = point = 0;
      lower = 0x80;
      upper = 0xbf;
      points.push(0xfffd);
      i--;
      continue;
    }
    lower = 0x80;
    upper = 0xbf;
    point = (point << 6) | (b & 0x3f);
    if (++seen === needed) {
      points.push(point);
      needed = seen = point = 0;
    }
  }
  if (needed !== 0) points.push(0xfffd);
  let out = "";
  for (let i = 0; i < points.length; i += 4096) out += String.fromCodePoint(...points.slice(i, i + 4096));
  return out;
}

const isUnreserved = (b: number) =>
  (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39) || b === 0x2d || b === 0x2e || b === 0x5f || b === 0x7e;

/** Escapes every byte outside `A-Z a-z 0-9 - . _ ~`, in upper-case hex. */
export function percentEncode(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += isUnreserved(b) ? String.fromCharCode(b) : "%" + HEX[b >> 4].toUpperCase() + HEX[b & 15].toUpperCase();
  return out;
}

const isHexDigit = (c: string) => /^[0-9a-fA-F]$/.test(c);

/** Strict percent-decoding of ASCII text: every `%` is followed by two hex digits,
 *  in either case, and `+` is literal. Null on a malformed escape or a non-ASCII
 *  character. Never decodeURIComponent, which throws on bad UTF-8. */
export function percentDecode(text: string): Uint8Array | null {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0x7f) return null;
    if (c !== 0x25) {
      out.push(c);
      continue;
    }
    const a = text.charAt(i + 1);
    const b = text.charAt(i + 2);
    if (!isHexDigit(a) || !isHexDigit(b)) return null;
    out.push(parseInt(a + b, 16));
    i += 2;
  }
  return Uint8Array.from(out);
}

/** Bytes from globalThis.crypto.getRandomValues, the only source of randomness. */
export function randomBytes(n: number): Uint8Array {
  const c = (globalThis as { crypto?: { getRandomValues<T extends Uint8Array>(a: T): T } }).crypto;
  if (!c?.getRandomValues) throw new Error("globalThis.crypto.getRandomValues is missing");
  return c.getRandomValues(new Uint8Array(n));
}
