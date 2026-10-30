# File peek (`peek_file`)

Decided in ADR 0008 (`decisions/0008-file-previews-are-bounded-and-inert.md`); built in Story 1 of `_bmad-output/plan-file-hover-preview.md`, with the image arm added by Story 3 and the PDF arm by Story 4.

Any feature that reads a file to preview it uses `peek_file`, not `read_file` or `read_file_base64`.

## The command

`#[tauri::command] pub async fn peek_file(path: String, kind: PeekKind, known: Option<String>) -> Result<tauri::ipc::Response, String>`, in `src-tauri/src/filepeek.rs`. The work (`peek_path`) runs inside `tauri::async_runtime::spawn_blocking`, on tauri's blocking pool, so a slow read or check never holds one of the shared async workers that other commands (`create_pty`, `resolve_file_paths`, `get_pty_cwd`, ...) run on. This is the same idiom as `sync_now`.

- **Call site.** The frontend calls it from one place only: `peekFile(path, kind, known)` in `src/lib/filePeek.ts`, as the literal `invoke<ArrayBuffer>("peek_file", { path, kind, known })`, which `tauriCommandContract.test.ts` checks.
- **`path`** is used as given (no `~` expansion): the caller passes the `abs` that `resolve_file_paths` resolved.
- **`kind`** is `"text" | "image" | "pdf" | "html" | "meta"`. `peekKind(path)` picks it from `viewerKind`: `markdown` and `text` give `text`, `docx` gives `meta`, every other kind keeps its name.
- **`known`** is the stamp the caller's cache holds for the path, or absent.
- **Errors.** A missing path is an `Err` with the OS message. Anything that is not a regular file, before opening or on the open handle, is `Err("not a regular file")`.

## The frame

The response body is one frame:

1. a 4-byte big-endian header length;
2. the header, UTF-8 JSON `FilePeek`;
3. the payload: the raw file bytes for a `bytes` body, empty otherwise.

`frame(&FilePeek, &[u8]) -> Vec<u8>` (Rust) and `unframe(ArrayBuffer | Uint8Array | number[]) -> { peek, payload }` (TypeScript) are pure. `unframe` reads only a `Uint8Array`'s own view (`byteOffset`, `byteLength`), and throws on fewer than 4 bytes, a header length past the end, or a header that is not JSON.

**IPC shapes.** On the custom-protocol IPC path (normal on every platform) the frame arrives as an `ArrayBuffer`. On Tauri's postMessage fallback it arrives as a `number[]`; after the first such response, `peekFile` sends kind `meta` in place of `image` and `pdf` for the rest of that window's session.

**Test vector.** The frame of this header with an empty payload. `filepeek.rs` (`frame_matches_the_contract_vector`) and `filePeek.test.ts` ("unframe reads the contract vector in every IPC shape") both read the hex block below from this file.

```json
{"size":2,"modifiedMs":-1500,"stamp":"2:-1500000000:-1500000000:66306:42","body":{"type":"text","text":"é","truncated":false}}
```

```hex
00 00 00 7f 7b 22 73 69 7a 65 22 3a 32 2c 22 6d
6f 64 69 66 69 65 64 4d 73 22 3a 2d 31 35 30 30
2c 22 73 74 61 6d 70 22 3a 22 32 3a 2d 31 35 30
30 30 30 30 30 30 30 3a 2d 31 35 30 30 30 30 30
30 30 30 3a 36 36 33 30 36 3a 34 32 22 2c 22 62
6f 64 79 22 3a 7b 22 74 79 70 65 22 3a 22 74 65
78 74 22 2c 22 74 65 78 74 22 3a 22 c3 a9 22 2c
22 74 72 75 6e 63 61 74 65 64 22 3a 66 61 6c 73
65 7d 7d
```

The header is 127 (`0x7f`) bytes; `é` is `c3 a9`. A payload, when there is one, follows the last header byte.

## `FilePeek`

`{ size: number, modifiedMs: number | null, stamp: string, body: Body }`, camelCase.

- `size` and `modifiedMs` come from `std::fs::metadata`, which follows symlinks. `modifiedMs` is signed milliseconds since the epoch (negative before 1970), `null` when the platform has no mtime.
- `stamp` is opaque: the frontend only compares it for equality.
  - unix: `"{size}:{mtime_ns}:{ctime_ns}:{dev}:{ino}"` (ctime catches a same-size rewrite with mtime restored; dev and ino catch a retargeted symlink or a rename over the file).
  - other platforms: `"{size}:{mtime_ns}"`.

## `Body`, tagged by `type`

| Body | When |
|---|---|
| `{ type: "text", text, truncated }` | kinds `text` and `html` |
| `{ type: "binary" }` | kinds `text` and `html`: a NUL in the first 8 KiB, after UTF-16 decoding |
| `{ type: "bytes", length, width?, height? }` | kinds `image` (Story 3) and `pdf` (Story 4); the payload holds the bytes |
| `{ type: "tooLarge", limit }` | over the kind's size cap (Stories 3 and 4), by the stat (the file is not read) or by a read that finds it grew past the cap |
| `{ type: "skipped", reason, width?, height? }` | `reason`: `"notDownloaded"` (a macOS dataless file, Story 1; nothing is read), `"pixels"` (with `width` and `height`), `"noSize"`, `"svgFeatures"` (Story 3; read up to the cap, nothing sent). The payload is always empty |
| `{ type: "unchanged" }` | `known` equals the file's stamp; the file is not read |
| `{ type: "none" }` | kind `meta`; until Story 4, also kind `pdf`; unless the file is dataless (macOS), which gives `skipped/notDownloaded` |

Text decoding: a UTF-16 LE or BE BOM decodes as UTF-16 (UTF-16 without a BOM shows as binary); otherwise UTF-8, lossily, with an incomplete sequence at the read boundary dropped rather than turned into U+FFFD. `\r\n` becomes `\n`.

`width`, `height` and the `skipped` fields are left out of the JSON when absent (an SVG's `bytes` has neither).

## Images (Story 3)

Kind `image`. A path whose extension is `svg` (any case) is an SVG; anything else is a raster. The frontend types the Blob from the same extension (`imageMime`), so `image/svg+xml` is only ever paired with bytes that passed `svg_is_plain`.

- **Caps.** Rasters 10,000,000 bytes, SVG 1,000,000 bytes: over the cap by the stat is `tooLarge` with the file unread; a read of `cap + 1` that finds more (it grew) is `tooLarge` too.
- **Rasters:** `image_size(bytes) -> Option<(u32, u32)>`, picked by the bytes' signature, never the extension (a JPEG named `.png` is sized as a JPEG; an unknown signature is `None`). `None` gives `skipped/noSize`; an area over 40,000,000, computed as `w as u64 * h as u64`, gives `skipped/pixels` with the size; otherwise `bytes` with `width` and `height`. A zero side anywhere gives `None`.
  - PNG: IHDR.
  - GIF: the logical screen and every image descriptor, walking extension and LZW sub-blocks; the largest width and height, where a frame counts as `left + width` by `top + height` (a decoder may grow the canvas to fit it). A walk that runs off the end, or meets an unknown block, is `None`.
  - JPEG: segments from SOI by their lengths (fill bytes skipped; RSTn and TEM stand alone) up to the first SOS; the largest SOFn by area among them (C0-C3, C5-C7, C9-CB, CD-CF; C4 DHT, C8 JPG and CC DAC are not frame headers). No SOF before SOS, EOI or another SOI before SOS, a zero side in any SOF, or a walk that runs off the end is `None`. An SOF inside an APP1 EXIF thumbnail is skipped with its segment.
  - WebP: the first chunk, `VP8 `, `VP8L` or `VP8X` (canvas).
  - BMP: the DIB header (core or info), height as its absolute value.
  - ICO and CUR: every directory entry's data (a PNG signature means its IHDR, otherwise a DIB with half its height); the largest by area. An entry whose data is out of range is `None`.
- **SVG:** `svg_is_plain(bytes) -> bool`, else `skipped/svgFeatures`. All text checks ignore ASCII case and cover the whole file. It passes only if:
  - the bytes are UTF-8 (an optional UTF-8 BOM) with no NUL;
  - the only `<?` is an XML declaration at offset 0 (after the BOM): `<?xml` then whitespace, ended by `?>`, whose `encoding`, if present, is quoted `utf-8`;
  - there is no `<!--`, `<![CDATA[`, `<!ENTITY`, `<!ATTLIST` (libxml2 applies its default attributes, so CSS could get in), `data:`, `image-set(`, `\` or `foreignObject`;
  - there is no `[` before the first `<svg`, so no internal DTD subset (a DOCTYPE with only external ids passes);
  - every `&` begins `&amp;`, `&lt;`, `&gt;`, `&quot;` or `&apos;` (so no `&#` reference and no other entity);
  - every `url(` is a fragment reference: optional whitespace, an optional `"` or `'`, `#`, one or more `[A-Za-z0-9_.:-]`, the same quote, optional whitespace, `)`;
  - there is no `style` attribute (`style` after whitespace, then optional whitespace and `=`);
  - no `style`, `use`, `image` or `feImage` element, where `<name` matches when followed by whitespace, `/`, `>` or the end (`<user>` is not `<use>`);
  - no element name, start or end tag, has a namespace prefix (`<x:` or `</x:`). A name is read up to its first non-name character, so every check is linear in the file: 1 MB of `<` is checked in under 0.4 s in a debug build, and `svg_allowlist_is_linear` bounds 18 such shapes.

## Order of work

1. `metadata` (missing: `Err`; not `is_file()`: `Err("not a regular file")`).
2. `known` equals the stamp: `unchanged`.
3. macOS: `st_flags & SF_DATALESS` (`0x40000000`): `skipped/notDownloaded`.
4. The kind's size cap.
5. Open with `O_NONBLOCK` on unix, then require `is_file()` on the handle.
6. Read through `take(cap + 1)`; the extra byte marks `truncated` (for an image, `tooLarge`).
7. Images: `svg_is_plain` or `image_size`, as above. The payload is the whole file only for `bytes`.

## Limits

Size and pixel caps are `const`s in `filepeek.rs`; display and cache limits are constants in `src/lib/filePeek.ts`. Caps shown to the user are decimal.

| What | Limit | Story |
|---|---|---|
| Text/code read | first 16 KiB (16,384 bytes) | 1 |
| HTML read | first 256 KiB (262,144 bytes), as text | 1 |
| Binary sniff | a NUL in the first 8 KiB | 1 |
| Raster image | 10 MB (10,000,000 bytes); 40 megapixels, from the header, area in `u64`; no readable size means not sent | 3 |
| SVG | 1 MB, and only if `svg_is_plain` passes | 3 |
| PDF | 20 MB | 4 |
| Text shown, cache | 16 lines; 32 entries and 32 MB, LRU | 2 |
