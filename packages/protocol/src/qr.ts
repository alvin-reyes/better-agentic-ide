// The pairing QR code: ade-pair://v1?relay=..&slot=..&id=..&x=..&s=..&n=..
// The grammar, its errors and their precedence are in .ade/context/remote-protocol.md.
import { base64UrlDecode, base64UrlEncode, percentDecode, percentEncode, utf8Encode } from "./bytes";
import { cleanName, nameFromBytes } from "./names";

const PREFIX = "ade-pair://v";
const SECURE_SCHEME = "wss://";

/** Why a string is not a code this app can pair with. */
export type PairCodeError = "not_pairing_code" | "insecure_relay" | "newer_version";

export type PairCodeResult<T> = { ok: true; value: T } | { ok: false; error: PairCodeError };

/** A parsed pairing code. */
export interface PairCode {
  /** The relay URL, always `wss://` plus at least one character. */
  relay: string;
  slot: Uint8Array;
  /** `I_M`, the Mac's Ed25519 identity key. */
  id: Uint8Array;
  /** `S_M`, the Mac's X25519 static key. */
  x: Uint8Array;
  /** The pairing secret. */
  s: Uint8Array;
  /** The Mac's cleaned name; null shows as "Mac". */
  name: string | null;
}

export interface PairCodeInput {
  relay: string;
  slot: Uint8Array;
  id: Uint8Array;
  x: Uint8Array;
  s: Uint8Array;
  /** Cleaned before it is written; left out if it cleans to empty. */
  name: string;
}

const fail = (error: PairCodeError): { ok: false; error: PairCodeError } => ({ ok: false, error });

const isVisibleAscii = (text: string) => {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return false;
  }
  return true;
};

/** A relay is characters 0x21-0x7E (else not_pairing_code), then exactly
 *  `wss://` and at least one more character (else insecure_relay). */
function checkRelay(relay: string): PairCodeError | null {
  if (!isVisibleAscii(relay)) return "not_pairing_code";
  if (relay.length <= SECURE_SCHEME.length || !relay.startsWith(SECURE_SCHEME)) return "insecure_relay";
  return null;
}

/** Builds a code: relay, slot, id, x, s, then n. Refuses a relay that isn't wss://. */
export function buildPairCode(input: PairCodeInput): PairCodeResult<string> {
  const bad = checkRelay(input.relay);
  if (bad) return fail(bad);
  let code =
    `${PREFIX}1?relay=${percentEncode(utf8Encode(input.relay))}` +
    `&slot=${base64UrlEncode(input.slot)}&id=${base64UrlEncode(input.id)}` +
    `&x=${base64UrlEncode(input.x)}&s=${base64UrlEncode(input.s)}`;
  const name = cleanName(input.name);
  if (name !== "") code += `&n=${percentEncode(utf8Encode(name))}`;
  return { ok: true, value: code };
}

/** A required byte field: strict percent-decoding, then canonical unpadded
 *  base64url of exactly `len` bytes. */
function field(value: string, len: number): Uint8Array | null {
  const text = percentDecode(value);
  if (!text) return null;
  let ascii = "";
  for (const b of text) ascii += String.fromCharCode(b);
  const raw = base64UrlDecode(ascii);
  return raw && raw.length === len ? raw : null;
}

/** Parses a code. Structure errors win over insecure_relay. */
export function parsePairCode(code: string): PairCodeResult<PairCode> {
  if (code === "" || !isVisibleAscii(code)) return fail("not_pairing_code");
  if (!code.startsWith(PREFIX)) return fail("not_pairing_code");
  const after = code.slice(PREFIX.length);
  let digits = 0;
  while (digits < after.length && after[digits] >= "0" && after[digits] <= "9") digits++;
  const version = after.slice(0, digits);
  if (version === "" || version.startsWith("0")) return fail("not_pairing_code");
  if (version !== "1") return fail("newer_version");
  if (after[digits] !== "?") return fail("not_pairing_code");

  const required: Record<string, string | undefined> = { relay: undefined, slot: undefined, id: undefined, x: undefined, s: undefined };
  const names: string[] = [];
  for (const param of after.slice(digits + 1).split("&")) {
    const eq = param.indexOf("=");
    if (eq <= 0) return fail("not_pairing_code");
    const key = param.slice(0, eq);
    const value = param.slice(eq + 1);
    if (key === "n") names.push(value);
    else if (Object.prototype.hasOwnProperty.call(required, key)) {
      if (required[key] !== undefined) return fail("not_pairing_code");
      required[key] = value;
    }
  }

  const { relay: rawRelay, slot: rawSlot, id: rawId, x: rawX, s: rawS } = required;
  if (rawRelay === undefined || rawSlot === undefined || rawId === undefined || rawX === undefined || rawS === undefined) {
    return fail("not_pairing_code");
  }
  const relayBytes = percentDecode(rawRelay);
  const slot = field(rawSlot, 16);
  const id = field(rawId, 32);
  const x = field(rawX, 32);
  const s = field(rawS, 32);
  if (!relayBytes || !slot || !id || !x || !s) return fail("not_pairing_code");
  let relay = "";
  for (const b of relayBytes) relay += String.fromCharCode(b);
  const bad = checkRelay(relay);
  if (bad) return fail(bad);

  // A missing, duplicated or malformed n, or one that cleans to empty, is no name.
  let name: string | null = null;
  if (names.length === 1) {
    const bytes = percentDecode(names[0]);
    if (bytes) name = nameFromBytes(bytes) || null;
  }
  return { ok: true, value: { relay, slot, id, x, s, name } };
}
