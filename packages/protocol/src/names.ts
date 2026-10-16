// Name cleaning (spec, "Names"): the Mac's n and the phone's name in the reveal.
// Uses the spec's own code point lists, never trim, \s or Unicode classes.
import { utf8DecodeLossy } from "./bytes";

const MAX_NAME_CODE_POINTS = 40;

/** Step 1's list, removed wherever they are. Lone surrogates fall in D800-DFFF. */
const REMOVED: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x115f, 0x1160],
  [0x200b, 0x200c],
  [0x200e, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xd800, 0xdfff],
  [0xe000, 0xf8ff],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff0, 0xffff],
  [0xe0000, 0xe007f],
  [0xf0000, 0x10ffff],
];

/** Step 2's list, trimmed from both ends. */
const TRIMMED: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x0020],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

const inList = (list: ReadonlyArray<readonly [number, number]>, c: number) =>
  list.some(([lo, hi]) => lo <= c && c <= hi);
const isTrimmed = (c: number) => inList(TRIMMED, c);

function trimEnd(points: number[]) {
  while (points.length > 0 && isTrimmed(points[points.length - 1])) points.pop();
}

/** The spec's four steps: remove, trim, cut to 40 code points, trim the end again. */
export function cleanName(name: string): string {
  const points: number[] = [];
  // for..of walks code points, and yields a lone surrogate on its own.
  for (const ch of name) {
    const c = ch.codePointAt(0)!;
    if (!inList(REMOVED, c)) points.push(c);
  }
  let start = 0;
  while (start < points.length && isTrimmed(points[start])) start++;
  const kept = points.slice(start);
  trimEnd(kept);
  kept.length = Math.min(kept.length, MAX_NAME_CODE_POINTS);
  trimEnd(kept);
  return String.fromCodePoint(...kept);
}

/** A name received as bytes: lossy UTF-8 (each invalid subpart one U+FFFD, which
 *  cleaning removes), then cleaned. */
export function nameFromBytes(bytes: Uint8Array): string {
  return cleanName(utf8DecodeLossy(bytes));
}
