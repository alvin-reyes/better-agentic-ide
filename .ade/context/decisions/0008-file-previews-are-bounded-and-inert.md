# 0008: File previews are bounded and inert

- **Status:** Accepted by the owner on 2026-10-29, together with the plan `_bmad-output/plan-file-hover-preview.md`.

## Context

The owner wants a hover card on the file paths ADE links in terminal output. The card shows the first lines of a text or code file, an image thumbnail, the first page of a PDF, or a snapshot of an HTML page.

Three things make the existing file reads unfit for this:

- **They read whole files.** `read_file` and `read_file_base64` (`src-tauri/src/lib.rs`) have no limit, and the second returns base64. The viewers then decode it on the UI thread (`base64ToBytes` in `src/components/viewer/shared.tsx`).
- **Hovers fire constantly**, on whatever files agents happen to print: multi-gigabyte logs, archives, FIFOs, cloud-only files, and images whose small files decode to gigabytes.
- **The content is untrusted.** HTML and SVG written by an agent or a cloned repo would render inside the privileged Tauri webview. The preview panel today runs HTML with `allow-scripts`, and `HtmlView` neither sanitizes it nor sets its own CSP.

## Decision

**One bounded backend read.** Hover previews read files only through `peek_file` (`src-tauri/src/filepeek.rs`; the contract is in `.ade/context/file-peek.md`). Every limit is enforced in Rust:

- **Size and pixel caps:** read caps per kind, size caps, and a 40-megapixel raster cap. The cap is checked against image dimensions parsed from the file header in Rust (PNG, GIF frames, JPEG segments, WebP, BMP, ICO entries), with the area computed in `u64`.
- **Regular files only:** the file must be a regular file both before it is opened and on the open handle, and it is opened with `O_NONBLOCK`.
- **No downloads:** a macOS dataless (cloud-only) file is not read.
- **Raw bytes:** bytes travel as a `tauri::ipc::Response` frame, never as base64.
- **Change detection by stamp:** repeat hovers are answered `unchanged`, judged by an opaque stamp (size, mtime, ctime, dev, inode).

The frontend's only cap is pdf.js's `maxImageSize`, which bounds images embedded in a PDF.

**Inert rendering.**

- **Text** is rendered as React text nodes, never as HTML.
- **SVG** is rendered only as an `<img>` from a `blob:` URL, and only if it passes a narrow allowlist:
  - UTF-8 only;
  - no CSS;
  - no comments, CDATA or processing instructions;
  - no `data:`;
  - no `url(` other than a fragment-only `url(#id)`;
  - no escapes or unknown entities;
  - no `use`, `image`, `feImage` or `foreignObject` elements;
  - no prefixed element names.
- **HTML** is shown as follows:
  - It is sanitized with DOMPurify in whole-document mode, repeated until the output stops changing.
  - A deny-all CSP meta (`default-src 'none'; style-src 'unsafe-inline'`) is placed first in `<head>`, alongside `x-dns-prefetch-control` off.
  - The result is verified after serialization.
  - It is shown in an `<iframe sandbox="">` with `pointer-events: none`.
- **No `allow-*` tokens** ever appear in a hover preview's sandbox.

**Navigation is handled separately.** CSP does not govern a frame's own navigation, and the app's `frame-src` allows http and https. The sanitizer therefore removes every `meta`, `base`, `form` and frame element, and the sandbox and `pointer-events: none` do the rest.

## Consequences

- **Bounded cost.** A hover cannot read a whole large file, block on a special file, trigger a cloud download, or decode a large string or bitmap on the UI thread.
- **HTML snapshots are low-fidelity.** They show text and inline styles only, with no external CSS and no images; a page built by JavaScript falls back to its source lines. The owner accepted this on 2026-10-29.
- **Most real-world SVGs get no preview.** CSS-styled SVGs, which include most matplotlib and Mermaid output, as well as sprites and SVGs with embedded images, show details only. Even an SVG that passes has no pixel guarantee (a heavy filter can still be slow), and that is accepted.
- **pdf.js is only partly bounded.** `maxImageSize` bounds only declared image dimensions, so a JPX or DCT stream larger than declared can still use a lot of memory in the pdf.js worker.
- **There is one more IPC command.** Its frame format, limits and stamp rule form a contract, recorded in `.ade/context/file-peek.md`. Any later preview feature uses `peek_file` rather than `read_file*`.
- **On Tauri's postMessage IPC fallback, bytes arrive as a number array.** After the first such response, that window asks for details only for images and PDFs.
- **The existing preview paths are not changed.** The preview panel and `HtmlView` keep their own, looser handling; tightening them is a separate decision.
