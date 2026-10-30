//! `peek_file`: the bounded read behind the terminal's hover previews. The
//! contract (frame layout, bodies, stamp, limits) is in
//! `.ade/context/file-peek.md`; ADR 0008 says why every limit lives here.

use serde::{Deserialize, Serialize};
use std::fs::{File, Metadata};
use std::io::{self, Read};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// First bytes of a text or code file read for its preview.
const TEXT_CAP: usize = 16 * 1024;
/// First bytes of an HTML page read for its snapshot.
const HTML_CAP: usize = 256 * 1024;
/// A NUL in this many leading bytes means the file is binary (git's rule).
const SNIFF: usize = 8 * 1024;
/// A raster image is sent whole, so it is not read past this.
const IMAGE_CAP: usize = 10_000_000;
/// An SVG is sent whole, so it is not read past this.
const SVG_CAP: usize = 1_000_000;
/// The most pixels a raster may decode to: a small file can hold a huge bitmap.
const MAX_PIXELS: u64 = 40_000_000;
const NOT_REGULAR: &str = "not a regular file";
/// `st_flags` bit of a macOS file whose content is in the cloud only.
#[cfg(target_os = "macos")]
const SF_DATALESS: u32 = 0x4000_0000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PeekKind {
    Text,
    Image,
    Pdf,
    Html,
    Meta,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SkipReason {
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    NotDownloaded,
    Pixels,
    NoSize,
    SvgFeatures,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Body {
    Text { text: String, truncated: bool },
    Binary,
    Bytes {
        length: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        width: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        height: Option<u32>,
    },
    TooLarge { limit: u64 },
    Skipped {
        reason: SkipReason,
        #[serde(skip_serializing_if = "Option::is_none")]
        width: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        height: Option<u32>,
    },
    Unchanged,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePeek {
    pub size: u64,
    pub modified_ms: Option<i64>,
    pub stamp: String,
    pub body: Body,
}

/// Opaque change stamp; see the contract for what each part catches.
#[cfg(unix)]
pub fn stamp(meta: &Metadata) -> String {
    use std::os::unix::fs::MetadataExt;
    let ns = |secs: i64, nsec: i64| secs as i128 * 1_000_000_000 + nsec as i128;
    let (mtime, ctime) = (ns(meta.mtime(), meta.mtime_nsec()), ns(meta.ctime(), meta.ctime_nsec()));
    format!("{}:{mtime}:{ctime}:{}:{}", meta.len(), meta.dev(), meta.ino())
}

#[cfg(not(unix))]
pub fn stamp(meta: &Metadata) -> String {
    let mtime = meta.modified().map(epoch_ns).unwrap_or(0);
    format!("{}:{mtime}", meta.len())
}

/// Nanoseconds since the epoch, negative before 1970.
fn epoch_ns(t: SystemTime) -> i128 {
    match t.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_nanos() as i128,
        Err(e) => -(e.duration().as_nanos() as i128),
    }
}

/// Open for reading without blocking on a special file, and refuse anything
/// that is not a regular file on the open handle itself.
pub fn open_regular(path: &Path) -> io::Result<File> {
    let mut options = File::options();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options.open(path)?;
    if !file.metadata()?.is_file() {
        return Err(io::Error::other(NOT_REGULAR));
    }
    Ok(file)
}

/// At most `cap` bytes, and whether there were more. The reader is asked for
/// at most `cap + 1` bytes, so this ends even on an endless source.
pub fn read_bounded<R: Read>(r: R, cap: usize) -> io::Result<(Vec<u8>, bool)> {
    let mut bytes = Vec::new();
    r.take(cap as u64 + 1).read_to_end(&mut bytes)?;
    let truncated = bytes.len() > cap;
    bytes.truncate(cap);
    Ok((bytes, truncated))
}

/// The text body of a file's first bytes, or `binary`.
pub fn decode_text(bytes: &[u8], truncated: bool) -> Body {
    let text = match bytes {
        [0xFF, 0xFE, rest @ ..] => utf16(rest, truncated, u16::from_le_bytes),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, truncated, u16::from_be_bytes),
        _ => {
            if bytes[..bytes.len().min(SNIFF)].contains(&0) {
                return Body::Binary;
            }
            let end = if truncated { bytes.len() - incomplete_tail(bytes) } else { bytes.len() };
            Some(String::from_utf8_lossy(&bytes[..end]).into_owned())
        }
    };
    match text {
        Some(text) => Body::Text { text: text.replace("\r\n", "\n"), truncated },
        None => Body::Binary,
    }
}

/// UTF-16 code units, or `None` for a NUL in the first 8 KiB (sniffed after
/// decoding, since UTF-16's ASCII is half NUL bytes). When the read cut the
/// file, a half unit or the first half of a surrogate pair at the end is
/// dropped rather than shown as U+FFFD.
fn utf16(bytes: &[u8], truncated: bool, unit: fn([u8; 2]) -> u16) -> Option<String> {
    let mut units: Vec<u16> = bytes.chunks_exact(2).map(|c| unit([c[0], c[1]])).collect();
    if units.iter().take(SNIFF / 2).any(|&u| u == 0) {
        return None;
    }
    if truncated && units.last().is_some_and(|u| (0xD800..0xDC00).contains(u)) {
        units.pop();
    }
    Some(String::from_utf16_lossy(&units))
}

/// Length of a UTF-8 sequence the read cut short at the end of `bytes`, or 0.
fn incomplete_tail(bytes: &[u8]) -> usize {
    for back in 1..=bytes.len().min(3) {
        let b = bytes[bytes.len() - back];
        if b & 0xC0 == 0x80 {
            continue; // a continuation byte: look further back for the lead
        }
        let needs = match b {
            0xC0..=0xDF => 2,
            0xE0..=0xEF => 3,
            0xF0..=0xF7 => 4,
            _ => 1,
        };
        return if needs > back { back } else { 0 };
    }
    0
}

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

fn be16(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(b.get(at..at.checked_add(2)?)?.try_into().ok()?))
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at.checked_add(4)?)?.try_into().ok()?))
}

fn le16(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(b.get(at..at.checked_add(2)?)?.try_into().ok()?))
}

fn le32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(at..at.checked_add(4)?)?.try_into().ok()?))
}

fn le24(b: &[u8], at: usize) -> Option<u32> {
    let s = b.get(at..at.checked_add(3)?)?;
    Some(u32::from_le_bytes([s[0], s[1], s[2], 0]))
}

/// A size with no zero side: a zero (such as a JPEG height deferred to a DNL
/// marker) means the real size is unknown.
fn nonzero(w: u32, h: u32) -> Option<(u32, u32)> {
    (w != 0 && h != 0).then_some((w, h))
}

/// Pixels in `w` by `h`, in `u64`: 65536 x 65536 is 0 in `u32`.
fn area((w, h): (u32, u32)) -> u64 {
    w as u64 * h as u64
}

/// Width and height of the largest image the browser could decode from these
/// bytes, picked by their signature, not the file's extension. `None` when the
/// format is not one of these, the header is cut short, or a side is zero.
pub fn image_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.starts_with(PNG_SIGNATURE) {
        png_size(b)
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        gif_size(b)
    } else if b.starts_with(&[0xFF, 0xD8]) {
        jpeg_size(b)
    } else if b.starts_with(b"RIFF") && b.get(8..12) == Some(b"WEBP") {
        webp_size(b)
    } else if b.starts_with(b"BM") {
        dib_size(b.get(14..)?, false)
    } else if b.starts_with(&[0, 0, 1, 0]) || b.starts_with(&[0, 0, 2, 0]) {
        ico_size(b)
    } else {
        None
    }
}

/// IHDR; APNG frames must fit inside it.
fn png_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.get(12..16)? != b"IHDR" {
        return None;
    }
    nonzero(be32(b, 16)?, be32(b, 20)?)
}

/// A BMP's DIB header (core or info), height as its absolute value. In an
/// ICO the height covers the AND mask too, so the image is half of it.
fn dib_size(b: &[u8], ico: bool) -> Option<(u32, u32)> {
    let (w, h) = match le32(b, 0)? {
        12 => (le16(b, 4)? as u32, le16(b, 6)? as u32),
        n if n >= 16 => ((le32(b, 4)? as i32).unsigned_abs(), (le32(b, 8)? as i32).unsigned_abs()),
        _ => return None,
    };
    nonzero(w, if ico { h / 2 } else { h })
}

/// The logical screen and every frame, found by walking the blocks; the
/// largest width and height of them all (a frame's offset included, since a
/// decoder may grow the canvas to fit it). A walk that runs off the end is `None`.
fn gif_size(b: &[u8]) -> Option<(u32, u32)> {
    let color_table = |flags: u8| if flags & 0x80 != 0 { 3usize << ((flags & 7) + 1) } else { 0 };
    // Data sub-blocks, each led by its length, until a zero length.
    let sub_blocks = |mut i: usize| -> Option<usize> {
        loop {
            let n = *b.get(i)? as usize;
            i += 1 + n;
            if n == 0 {
                return Some(i);
            }
        }
    };
    let (mut w, mut h) = nonzero(le16(b, 6)? as u32, le16(b, 8)? as u32)?;
    let mut i = 13 + color_table(*b.get(10)?);
    loop {
        match *b.get(i)? {
            0x3B => return Some((w, h)),
            // Extension: introducer, label, sub-blocks.
            0x21 => i = sub_blocks(i + 2)?,
            // Image descriptor: left, top, width, height, flags; a local color
            // table; the LZW minimum code size; sub-blocks.
            0x2C => {
                let (left, top) = (le16(b, i + 1)? as u32, le16(b, i + 3)? as u32);
                let (fw, fh) = nonzero(le16(b, i + 5)? as u32, le16(b, i + 7)? as u32)?;
                w = w.max(left + fw);
                h = h.max(top + fh);
                i = sub_blocks(i + 10 + color_table(*b.get(i + 9)?) + 1)?;
            }
            _ => return None,
        }
    }
}

/// The largest top-level SOFn before the first scan, walking the segments
/// from SOI by their lengths, so an SOF inside an APP1 EXIF thumbnail is
/// skipped with its segment. A zero side in any of them is `None`.
fn jpeg_size(b: &[u8]) -> Option<(u32, u32)> {
    let mut largest: Option<(u32, u32)> = None;
    let mut i = 2;
    loop {
        if *b.get(i)? != 0xFF {
            return None;
        }
        // Any number of 0xFF fill bytes, then the marker.
        while *b.get(i)? == 0xFF {
            i += 1;
        }
        let marker = b[i];
        i += 1;
        match marker {
            // RSTn and TEM stand alone.
            0xD0..=0xD7 | 0x01 => continue,
            // The scan: what follows is image data, not segments.
            0xDA => return largest,
            // The end, or another image, before any scan.
            0xD8 | 0xD9 => return None,
            _ => {
                let len = be16(b, i)? as usize;
                if len < 2 {
                    return None;
                }
                // SOFn; C4 (DHT), C8 (JPG) and CC (DAC) are not frame headers.
                if (0xC0..=0xCF).contains(&marker) && !matches!(marker, 0xC4 | 0xC8 | 0xCC) {
                    // Length, precision, height, width.
                    let size = nonzero(be16(b, i + 5)? as u32, be16(b, i + 3)? as u32)?;
                    if largest.is_none_or(|l| area(size) > area(l)) {
                        largest = Some(size);
                    }
                }
                i += len;
            }
        }
    }
}

/// The first chunk: `VP8 ` (lossy), `VP8L` (lossless) or `VP8X` (the
/// canvas, which animation frames must fit).
fn webp_size(b: &[u8]) -> Option<(u32, u32)> {
    let data = b.get(20..)?;
    match b.get(12..16)? {
        b"VP8 " => {
            if data.get(3..6)? != [0x9d, 0x01, 0x2a] {
                return None;
            }
            nonzero((le16(data, 6)? & 0x3FFF) as u32, (le16(data, 8)? & 0x3FFF) as u32)
        }
        b"VP8L" => {
            if *data.first()? != 0x2F {
                return None;
            }
            let bits = le32(data, 1)?;
            Some(((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1))
        }
        b"VP8X" => Some((le24(data, 4)? + 1, le24(data, 7)? + 1)),
        _ => None,
    }
}

/// Every directory entry's own image (a PNG's IHDR, or else a DIB header);
/// the largest wins, so a PNG inside an ICO cannot get past the pixel cap.
fn ico_size(b: &[u8]) -> Option<(u32, u32)> {
    let count = le16(b, 4)? as usize;
    let mut largest: Option<(u32, u32)> = None;
    for entry in 0..count {
        let at = 6 + 16 * entry;
        let (len, offset) = (le32(b, at + 8)? as usize, le32(b, at + 12)? as usize);
        let data = b.get(offset..offset.checked_add(len)?)?;
        let size = if data.starts_with(PNG_SIGNATURE) { png_size(data)? } else { dib_size(data, true)? };
        if largest.is_none_or(|l| area(size) > area(l)) {
            largest = Some(size);
        }
    }
    largest
}

/// Whether `<name` at `at` (lowercase) is that element: followed by
/// whitespace, `/`, `>` or the end, so `<user>` is not `<use>`.
fn element_at(lower: &str, at: usize, name: &str) -> bool {
    let rest = &lower[at + 1..];
    rest.starts_with(name) && rest[name.len()..].bytes().next().is_none_or(|c| c.is_ascii_whitespace() || c == b'/' || c == b'>')
}

/// Whether the text at the start of `s` (just after `url(`) is a fragment
/// reference: optional whitespace, an optional quote, `#`, an id of
/// `[A-Za-z0-9_.:-]`, the same quote, optional whitespace, then `)`.
fn fragment_url(s: &str) -> bool {
    let s = s.trim_start_matches(|c: char| c.is_ascii_whitespace());
    let (quote, s) = match s.chars().next() {
        Some(q @ ('"' | '\'')) => (Some(q), &s[1..]),
        _ => (None, s),
    };
    let Some(s) = s.strip_prefix('#') else { return false };
    let id = s.find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | ':' | '-'))).unwrap_or(s.len());
    if id == 0 {
        return false;
    }
    let mut s = &s[id..];
    if let Some(q) = quote {
        let Some(rest) = s.strip_prefix(q) else { return false };
        s = rest;
    }
    s.trim_start_matches(|c: char| c.is_ascii_whitespace()).starts_with(')')
}

/// Whether an SVG is plain enough to preview: the allowlist in the contract
/// (`.ade/context/file-peek.md`). It rules out every route found to an
/// embedded raster, an external load, nested `<use>` or entity expansion, by
/// refusing what could hide one rather than parsing it.
pub fn svg_is_plain(bytes: &[u8]) -> bool {
    // UTF-8 only (a UTF-16 BOM is not UTF-8), and no NUL.
    let Ok(text) = std::str::from_utf8(bytes) else { return false };
    if text.contains('\0') {
        return false;
    }
    let lower = text.strip_prefix('\u{FEFF}').unwrap_or(text).to_ascii_lowercase();

    // The one processing instruction allowed: an XML declaration at offset 0,
    // whose encoding, if named, is UTF-8.
    let mut after_decl = lower.as_str();
    if lower.starts_with("<?xml") && lower[5..].starts_with(|c: char| c.is_ascii_whitespace()) {
        let Some(end) = lower.find("?>") else { return false };
        let decl = &lower[..end];
        if let Some(at) = decl.find("encoding") {
            let Some(value) = decl[at + 8..].trim_start().strip_prefix('=').map(str::trim_start) else { return false };
            let Some(q @ ('"' | '\'')) = value.chars().next() else { return false };
            let mut parts = value[1..].splitn(2, q);
            if parts.next() != Some("utf-8") || parts.next().is_none() {
                return false;
            }
        }
        after_decl = &lower[end + 2..];
    }
    if after_decl.contains("<?") {
        return false;
    }

    // No comments, CDATA, entity or attribute-list declarations, embedded
    // data, image sets, escapes or foreign content.
    if ["<!--", "<![cdata[", "<!entity", "<!attlist", "data:", "image-set(", "\\", "foreignobject"].iter().any(|bad| lower.contains(bad)) {
        return false;
    }
    // No internal DTD subset: libxml2 applies its default attributes. It can
    // only come before the root element, and nothing else there uses `[`.
    if lower[..lower.find("<svg").unwrap_or(lower.len())].contains('[') {
        return false;
    }
    // Every `&` starts one of the five XML entities (so no `&#` either).
    for (at, _) in lower.match_indices('&') {
        if !["&amp;", "&lt;", "&gt;", "&quot;", "&apos;"].iter().any(|e| lower[at..].starts_with(e)) {
            return false;
        }
    }
    // `url(` only as an in-document fragment reference.
    for (at, _) in lower.match_indices("url(") {
        if !fragment_url(&lower[at + 4..]) {
            return false;
        }
    }
    // No `style` attribute: `style` after whitespace, then optional whitespace and `=`.
    for (at, _) in lower.match_indices("style") {
        let after_space = lower[..at].ends_with(|c: char| c.is_ascii_whitespace());
        if after_space && lower[at + 5..].trim_start().starts_with('=') {
            return false;
        }
    }
    for (at, _) in lower.match_indices('<') {
        // No CSS, and no element that pulls in another image or document.
        if ["style", "use", "image", "feimage"].iter().any(|name| element_at(&lower, at, name)) {
            return false;
        }
        // No namespace prefix on an element name, start or end tag. The name
        // ends at its first non-name character (a `<` among them), so every
        // byte is scanned once: the check stays linear on `<<<<…`.
        let name = lower[at + 1..].strip_prefix('/').unwrap_or(&lower[at + 1..]);
        let colon = name.bytes().take_while(|&c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.' | b':') || c >= 0x80).any(|c| c == b':');
        if colon {
            return false;
        }
    }
    true
}

/// A 4-byte big-endian header length, the JSON header, then the payload.
pub fn frame(peek: &FilePeek, payload: &[u8]) -> Vec<u8> {
    // Plain structs, strings and numbers: serializing cannot fail.
    let header = serde_json::to_vec(peek).expect("FilePeek serializes");
    let mut out = Vec::with_capacity(4 + header.len() + payload.len());
    out.extend_from_slice(&(header.len() as u32).to_be_bytes());
    out.extend_from_slice(&header);
    out.extend_from_slice(payload);
    out
}

/// The peek of one file and its payload, in the contract's order of work.
pub fn peek_path(path: &Path, kind: PeekKind, known: Option<&str>) -> Result<(FilePeek, Vec<u8>), String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    if !meta.is_file() {
        return Err(NOT_REGULAR.into());
    }
    let stamp = stamp(&meta);
    let unchanged = known == Some(stamp.as_str());
    let modified_ms = meta.modified().ok().map(|t| epoch_ns(t).div_euclid(1_000_000) as i64);
    let peek = |body| FilePeek { size: meta.len(), modified_ms, stamp, body };
    if unchanged {
        return Ok((peek(Body::Unchanged), Vec::new()));
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::macos::fs::MetadataExt;
        if meta.st_flags() & SF_DATALESS != 0 {
            return Ok((peek(Body::Skipped { reason: SkipReason::NotDownloaded, width: None, height: None }), Vec::new()));
        }
    }
    let cap = match kind {
        PeekKind::Text => TEXT_CAP,
        PeekKind::Html => HTML_CAP,
        PeekKind::Image => {
            let (body, payload) = image_body(path, meta.len(), || open_regular(path))?;
            return Ok((peek(body), payload));
        }
        // PDFs arrive with Story 4; until then, details only.
        PeekKind::Pdf | PeekKind::Meta => return Ok((peek(Body::None), Vec::new())),
    };
    let file = open_regular(path).map_err(|e| e.to_string())?;
    let (bytes, truncated) = read_bounded(file, cap).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    Ok((peek(decode_text(&bytes, truncated)), Vec::new()))
}

/// The body and payload of an image whose stat says `size` bytes; `open`
/// opens it, and is not called at all when the stat is over the cap. An SVG
/// (by extension) is checked by `svg_is_plain`, a raster by `image_size`.
pub fn image_body<R: Read>(path: &Path, size: u64, open: impl FnOnce() -> io::Result<R>) -> Result<(Body, Vec<u8>), String> {
    let svg = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("svg"));
    let cap = if svg { SVG_CAP } else { IMAGE_CAP };
    // An image is sent whole, so one over its cap is not read at all.
    let too_large = || Ok((Body::TooLarge { limit: cap as u64 }, Vec::new()));
    if size > cap as u64 {
        return too_large();
    }
    let file = open().map_err(|e| e.to_string())?;
    let (bytes, truncated) = read_bounded(file, cap).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    // It grew past the cap after the stat.
    if truncated {
        return too_large();
    }
    let skipped = |reason, size: Option<(u32, u32)>| Body::Skipped { reason, width: size.map(|s| s.0), height: size.map(|s| s.1) };
    let body = if svg {
        if svg_is_plain(&bytes) {
            Body::Bytes { length: bytes.len() as u64, width: None, height: None }
        } else {
            skipped(SkipReason::SvgFeatures, None)
        }
    } else {
        match image_size(&bytes) {
            None => skipped(SkipReason::NoSize, None),
            Some(size) if area(size) > MAX_PIXELS => skipped(SkipReason::Pixels, Some(size)),
            Some((w, h)) => Body::Bytes { length: bytes.len() as u64, width: Some(w), height: Some(h) },
        }
    };
    let payload = if matches!(body, Body::Bytes { .. }) { bytes } else { Vec::new() };
    Ok((body, payload))
}

/// On tauri's blocking pool, not on a shared async worker: the read is
/// bounded, but a slow mount or a slow check must not stall other commands.
#[tauri::command]
pub async fn peek_file(path: String, kind: PeekKind, known: Option<String>) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (peek, payload) = peek_path(Path::new(&path), kind, known.as_deref())?;
        Ok(tauri::ipc::Response::new(frame(&peek, &payload)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Duration;

    /// A fresh temp dir, removed when the test ends, pass or fail.
    struct Scratch(PathBuf);

    impl std::ops::Deref for Scratch {
        type Target = Path;
        fn deref(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn scratch(name: &str) -> Scratch {
        let dir = std::env::temp_dir().join(format!("ade-filepeek-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Scratch(dir)
    }

    fn peek(path: &Path, kind: PeekKind) -> FilePeek {
        peek_path(path, kind, None).unwrap().0
    }

    fn text_of(body: &Body) -> (&str, bool) {
        match body {
            Body::Text { text, truncated } => (text, *truncated),
            other => panic!("expected text, got {other:?}"),
        }
    }

    /// `f` on its own thread, so a call that blocks fails the test instead of
    /// hanging `cargo test`.
    #[cfg(unix)]
    fn within_5s<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(f());
        });
        rx.recv_timeout(Duration::from_secs(5)).expect("blocked for 5 s")
    }

    #[cfg(unix)]
    fn mkfifo(path: &Path) {
        use std::os::unix::ffi::OsStrExt;
        let c = std::ffi::CString::new(path.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0, "mkfifo failed");
    }

    #[test]
    fn text_is_read_up_to_the_cap() {
        let dir = scratch("cap");
        let small = dir.join("small.txt");
        std::fs::write(&small, "hello\nworld\n").unwrap();
        let p = peek(&small, PeekKind::Text);
        assert_eq!(text_of(&p.body), ("hello\nworld\n", false));
        assert_eq!(p.size, 12);
        let mtime = std::fs::metadata(&small).unwrap().modified().unwrap();
        let ms = mtime.duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
        assert_eq!(p.modified_ms, Some(ms));
        assert!(!p.stamp.is_empty());

        let big = dir.join("big.log");
        std::fs::write(&big, "0123456789abcdef".repeat(100 * 1024 / 16)).unwrap();
        let p = peek(&big, PeekKind::Text);
        let (text, truncated) = text_of(&p.body);
        assert_eq!(text.len(), 16 * 1024);
        assert!(truncated);
        assert_eq!(p.size, 100 * 1024);

        let page = dir.join("page.html");
        std::fs::write(&page, "<p>0123456789</p>\n".repeat(300 * 1024 / 18)).unwrap();
        let p = peek(&page, PeekKind::Html);
        let (text, truncated) = text_of(&p.body);
        assert_eq!(text.len(), 256 * 1024);
        assert!(truncated);
        // A text kind still stops at 16 KiB on the same file.
        assert_eq!(text_of(&peek(&page, PeekKind::Text).body).0.len(), 16 * 1024);
    }

    #[test]
    fn binary_and_text_encodings() {
        let mut nul = vec![b'a'; SNIFF];
        nul[SNIFF - 1] = 0;
        assert_eq!(decode_text(&nul, false), Body::Binary, "a NUL in the first 8 KiB");
        let mut late = vec![b'a'; SNIFF + 10];
        late[SNIFF] = 0;
        assert!(matches!(decode_text(&late, false), Body::Text { .. }), "a NUL past 8 KiB is not sniffed");

        // "ab" then the first two of the euro sign's three bytes, cut by the read.
        let cut = [b'a', b'b', 0xE2, 0x82];
        assert_eq!(decode_text(&cut, true), Body::Text { text: "ab".into(), truncated: true });
        let cut4 = [b'a', 0xF0, 0x9F, 0x98];
        assert_eq!(text_of(&decode_text(&cut4, true)).0, "a");
        let whole = "ab€".as_bytes();
        assert_eq!(text_of(&decode_text(whole, true)).0, "ab€", "a complete character at the boundary stays");
        // A file that really ends in a broken sequence was not cut: it is lossy, not dropped.
        assert_eq!(decode_text(&cut, false), Body::Text { text: "ab\u{FFFD}".into(), truncated: false });

        assert_eq!(text_of(&decode_text(b"a\xFFb", false)).0, "a\u{FFFD}b", "invalid UTF-8 inside is lossy");
        assert_eq!(text_of(&decode_text(b"one\r\ntwo\r\n", false)).0, "one\ntwo\n");

        let le: Vec<u8> = [0xFF, 0xFE].into_iter().chain("hé\r\n".encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        assert_eq!(text_of(&decode_text(&le, false)).0, "hé\n", "UTF-16 LE with a BOM");
        let be: Vec<u8> = [0xFE, 0xFF].into_iter().chain("hé\r\n".encode_utf16().flat_map(|u| u.to_be_bytes())).collect();
        assert_eq!(text_of(&decode_text(&be, false)).0, "hé\n", "UTF-16 BE with a BOM");
        let le_nul: Vec<u8> = [0xFF, 0xFE].into_iter().chain("a\0b".encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        assert_eq!(decode_text(&le_nul, false), Body::Binary, "a NUL character in UTF-16");
        // Only the first 8 KiB are sniffed in UTF-16 too: a NUL at byte 2 + 2 * 5000 is text.
        let mut late16: Vec<u16> = vec![u16::from(b'a'); 6000];
        late16[5000] = 0;
        let le_late: Vec<u8> = [0xFF, 0xFE].into_iter().chain(late16.iter().flat_map(|u| u.to_le_bytes())).collect();
        assert!(matches!(decode_text(&le_late, false), Body::Text { .. }), "a UTF-16 NUL past 8 KiB is not sniffed");
        // Cut by the read: half a code unit, then half a surrogate pair.
        let mut le_cut: Vec<u8> = [0xFF, 0xFE].into_iter().chain("a😀".encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        le_cut.truncate(le_cut.len() - 1);
        assert_eq!(text_of(&decode_text(&le_cut, true)).0, "a");
        le_cut.truncate(le_cut.len() - 1);
        assert_eq!(text_of(&decode_text(&le_cut, true)).0, "a");

        // Through the file read too.
        let dir = scratch("enc");
        let f = dir.join("utf16.txt");
        std::fs::write(&f, &le).unwrap();
        assert_eq!(text_of(&peek(&f, PeekKind::Text).body).0, "hé\n");
        let broken = dir.join("broken.txt");
        std::fs::write(&broken, cut).unwrap();
        assert_eq!(text_of(&peek(&broken, PeekKind::Text).body), ("ab\u{FFFD}", false));
        let empty = dir.join("empty.txt");
        std::fs::write(&empty, "").unwrap();
        assert_eq!(peek(&empty, PeekKind::Text).body, Body::Text { text: String::new(), truncated: false });
    }

    #[test]
    fn reads_are_bounded_by_bytes() {
        struct Counting<R> {
            inner: R,
            given: u64,
        }
        impl<R: Read> Read for Counting<R> {
            fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
                let n = self.inner.read(buf)?;
                self.given += n as u64;
                Ok(n)
            }
        }
        let mut endless = Counting { inner: io::repeat(b'x'), given: 0 };
        let (bytes, truncated) = read_bounded(&mut endless, 1000).unwrap();
        assert_eq!(bytes.len(), 1000);
        assert!(truncated);
        assert!(endless.given <= 1001, "asked for {} bytes", endless.given);

        let (bytes, truncated) = read_bounded(&b"exactly"[..], 7).unwrap();
        assert_eq!((bytes.as_slice(), truncated), (&b"exactly"[..], false), "a file of exactly the cap is whole");
    }

    #[test]
    fn only_regular_files_are_read() {
        let dir = scratch("regular");
        assert!(peek_path(&dir.join("missing.txt"), PeekKind::Text, None).is_err());
        assert_eq!(peek_path(&dir, PeekKind::Text, None).unwrap_err(), "not a regular file");
        assert_eq!(peek_path(&dir, PeekKind::Meta, None).unwrap_err(), "not a regular file");

        #[cfg(unix)]
        {
            let fifo = dir.join("pipe");
            mkfifo(&fifo);
            let result = within_5s(move || peek_path(&fifo, PeekKind::Text, None).map(|_| ()));
            assert_eq!(result, Err("not a regular file".to_string()));

            let target = dir.join("target.md");
            std::fs::write(&target, "# Target\n").unwrap();
            let link = dir.join("link.md");
            std::os::unix::fs::symlink(&target, &link).unwrap();
            let p = peek(&link, PeekKind::Text);
            assert_eq!(text_of(&p.body).0, "# Target\n");
            assert_eq!(p.size, 9);
        }
    }

    #[cfg(unix)]
    #[test]
    fn open_does_not_block() {
        let dir = scratch("open");
        let fifo = dir.join("pipe");
        mkfifo(&fifo);
        let result = within_5s(move || open_regular(&fifo).map(|_| ()).map_err(|e| e.to_string()));
        assert_eq!(result, Err("not a regular file".to_string()));
        let file = dir.join("plain.txt");
        std::fs::write(&file, "x").unwrap();
        assert!(open_regular(&file).is_ok());
        assert!(open_regular(&dir).is_err());
    }

    #[test]
    fn stamp_catches_rewrites_and_retargets() {
        let dir = scratch("stamp");
        let f = dir.join("a.txt");
        std::fs::write(&f, "first").unwrap();
        let first = peek(&f, PeekKind::Text);
        let (again, payload) = peek_path(&f, PeekKind::Text, Some(&first.stamp)).unwrap();
        assert_eq!(again.body, Body::Unchanged);
        assert!(payload.is_empty());
        assert_eq!((again.size, again.modified_ms, &again.stamp), (first.size, first.modified_ms, &first.stamp));
        assert!(matches!(peek_path(&f, PeekKind::Text, Some("stale")).unwrap().0.body, Body::Text { .. }));

        #[cfg(unix)]
        {
            // Same size, mtime put back: only ctime can tell.
            std::thread::sleep(Duration::from_millis(50));
            let mtime = std::fs::metadata(&f).unwrap().modified().unwrap();
            std::fs::write(&f, "other").unwrap();
            File::options().write(true).open(&f).unwrap().set_modified(mtime).unwrap();
            let rewritten = peek(&f, PeekKind::Text);
            assert_eq!((rewritten.size, rewritten.modified_ms), (first.size, first.modified_ms));
            assert_ne!(rewritten.stamp, first.stamp, "ctime changed");

            // Same size and mtime, different file: dev and ino tell.
            let when = SystemTime::now() - Duration::from_secs(3600);
            let (a, b) = (dir.join("one.txt"), dir.join("two.txt"));
            for p in [&a, &b] {
                std::fs::write(p, "same").unwrap();
                File::options().write(true).open(p).unwrap().set_modified(when).unwrap();
            }
            let link = dir.join("link.txt");
            std::os::unix::fs::symlink(&a, &link).unwrap();
            let to_a = peek(&link, PeekKind::Meta);
            std::fs::remove_file(&link).unwrap();
            std::os::unix::fs::symlink(&b, &link).unwrap();
            let to_b = peek(&link, PeekKind::Meta);
            assert_eq!((to_a.size, to_a.modified_ms), (to_b.size, to_b.modified_ms));
            assert_ne!(to_a.stamp, to_b.stamp, "retargeted link");

            // The documented layout, so dev and ino are proven present whatever
            // the filesystem's ctime resolution.
            use std::os::unix::fs::MetadataExt;
            let m = std::fs::metadata(&b).unwrap();
            let ns = |s: i64, n: i64| s as i128 * 1_000_000_000 + n as i128;
            let expected = format!(
                "{}:{}:{}:{}:{}",
                m.size(),
                ns(m.mtime(), m.mtime_nsec()),
                ns(m.ctime(), m.ctime_nsec()),
                m.dev(),
                m.ino()
            );
            assert_eq!(to_b.stamp, expected);
        }

        let old = dir.join("old.txt");
        std::fs::write(&old, "1969").unwrap();
        File::options().write(true).open(&old).unwrap().set_modified(UNIX_EPOCH - Duration::from_secs(86_400)).unwrap();
        let p = peek(&old, PeekKind::Text);
        assert_eq!(p.modified_ms, Some(-86_400_000));
        assert_eq!(peek_path(&old, PeekKind::Text, Some(&p.stamp)).unwrap().0.body, Body::Unchanged);
        // Milliseconds round down, not toward zero: 1.5 ms before 1970 is -2.
        File::options().write(true).open(&old).unwrap().set_modified(UNIX_EPOCH - Duration::from_micros(1500)).unwrap();
        assert_eq!(peek(&old, PeekKind::Text).modified_ms, Some(-2));
    }

    #[test]
    fn meta_and_pending_kinds() {
        let dir = scratch("meta");
        let f = dir.join("report.pdf");
        std::fs::write(&f, "%PDF-1.7 not really").unwrap();
        // Images are read from Story 3 on; PDFs wait for Story 4.
        for kind in [PeekKind::Meta, PeekKind::Pdf] {
            let (p, payload) = peek_path(&f, kind, None).unwrap();
            assert_eq!(p.body, Body::None, "{kind:?}");
            assert_eq!(p.size, 19);
            assert!(!p.stamp.is_empty());
            assert!(payload.is_empty());
        }
    }

    // Minimal image headers, built by hand: only the fields `image_size` reads
    // are meaningful, the rest is zero.

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
        b.extend(w.to_be_bytes());
        b.extend(h.to_be_bytes());
        b.extend([8, 6, 0, 0, 0, 0, 0, 0, 0]); // depth, color type, methods, CRC
        b
    }

    /// A BITMAPINFOHEADER (no `BM` file header), as a BMP has after its 14 bytes and an ICO entry holds.
    fn dib(w: i32, h: i32) -> Vec<u8> {
        let mut b = 40u32.to_le_bytes().to_vec();
        b.extend(w.to_le_bytes());
        b.extend(h.to_le_bytes());
        b.extend([1, 0, 32, 0]);
        b.extend([0; 24]);
        b
    }

    fn bmp(w: i32, h: i32) -> Vec<u8> {
        let mut b = b"BM".to_vec();
        b.extend([0; 12]);
        b.extend(dib(w, h));
        b
    }

    fn webp(fourcc: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut b = b"RIFF".to_vec();
        b.extend((4 + 8 + data.len() as u32).to_le_bytes());
        b.extend(b"WEBP");
        b.extend(fourcc);
        b.extend((data.len() as u32).to_le_bytes());
        b.extend(data);
        b
    }

    fn vp8(w: u16, h: u16) -> Vec<u8> {
        let mut d = vec![0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a];
        d.extend(w.to_le_bytes());
        d.extend(h.to_le_bytes());
        webp(b"VP8 ", &d)
    }

    fn vp8l(w: u32, h: u32) -> Vec<u8> {
        let mut d = vec![0x2f];
        d.extend(((w - 1) | (h - 1) << 14).to_le_bytes());
        webp(b"VP8L", &d)
    }

    fn vp8x(w: u32, h: u32) -> Vec<u8> {
        let mut d = vec![0x10, 0, 0, 0];
        d.extend(&(w - 1).to_le_bytes()[..3]);
        d.extend(&(h - 1).to_le_bytes()[..3]);
        webp(b"VP8X", &d)
    }

    /// A GIF89a with a 2-color global table, a comment, then each frame as
    /// (left, top, width, height), each behind a graphic control extension,
    /// the second with a local color table.
    fn gif(screen: (u16, u16), frames: &[(u16, u16, u16, u16)]) -> Vec<u8> {
        let mut b = b"GIF89a".to_vec();
        b.extend(screen.0.to_le_bytes());
        b.extend(screen.1.to_le_bytes());
        b.extend([0x80, 0, 0]); // global color table of 2 entries
        b.extend([0, 0, 0, 255, 255, 255]);
        b.extend([0x21, 0xFE, 3, b'h', b'i', b'!', 0]); // a comment in one sub-block
        for (i, &(left, top, w, h)) in frames.iter().enumerate() {
            b.extend([0x21, 0xF9, 4, 0, 10, 0, 0, 0]);
            b.push(0x2C);
            for v in [left, top, w, h] {
                b.extend(v.to_le_bytes());
            }
            if i == 1 {
                b.push(0x81); // local color table of 4 entries
                b.extend([0x2C; 12]); // its bytes look like descriptors, to be skipped
            } else {
                b.push(0);
            }
            b.extend([2, 2, 0x4C, 0x01, 1, 0x2C, 0]); // LZW size, then 2- and 1-byte sub-blocks
        }
        b.push(0x3B);
        b
    }

    fn jpeg_sof(marker: u8, w: u16, h: u16) -> Vec<u8> {
        let mut b = vec![0xFF, marker, 0, 17, 8];
        b.extend(h.to_be_bytes());
        b.extend(w.to_be_bytes());
        b.extend([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
        b
    }

    /// SOI, an APP1 EXIF segment whose thumbnail has an SOF0 of 1x1, a DQT,
    /// the real SOF, then SOS and EOI.
    fn jpeg(sof: u8, w: u16, h: u16) -> Vec<u8> {
        let mut thumb = vec![0xFF, 0xD8];
        thumb.extend(jpeg_sof(0xC0, 1, 1));
        thumb.extend([0xFF, 0xD9]);
        let mut app1 = b"Exif\0\0".to_vec();
        app1.extend(&thumb);
        let mut b = vec![0xFF, 0xD8, 0xFF, 0xE1];
        b.extend((app1.len() as u16 + 2).to_be_bytes());
        b.extend(app1);
        b.extend([0xFF, 0xDB, 0, 4, 0, 0]);
        b.extend([0xFF, 0xFF]); // a fill byte before the next marker
        b.extend(jpeg_sof(sof, w, h));
        b.extend([0xFF, 0xDA, 0, 2, 0xAB, 0xFF, 0xD9]);
        b
    }

    /// An ICO whose entries hold each of `images` in turn (a PNG or a DIB).
    fn ico(images: &[Vec<u8>]) -> Vec<u8> {
        let mut b = vec![0, 0, 1, 0];
        b.extend((images.len() as u16).to_le_bytes());
        let mut offset = 6 + 16 * images.len() as u32;
        for img in images {
            b.extend([16, 16, 0, 0, 1, 0, 32, 0]); // the directory's own sizes are not trusted
            b.extend((img.len() as u32).to_le_bytes());
            b.extend(offset.to_le_bytes());
            offset += img.len() as u32;
        }
        for img in images {
            b.extend(img);
        }
        b
    }

    #[test]
    fn image_header_sizes() {
        assert_eq!(image_size(&png(640, 480)), Some((640, 480)));
        assert_eq!(image_size(&bmp(300, 200)), Some((300, 200)));
        assert_eq!(image_size(&bmp(300, -200)), Some((300, 200)), "a top-down BMP");
        assert_eq!(image_size(&vp8(320, 240)), Some((320, 240)));
        assert_eq!(image_size(&vp8l(1000, 16384)), Some((1000, 16384)));
        assert_eq!(image_size(&vp8x(16_777_216, 3)), Some((16_777_216, 3)));
        // GIF: every frame counts, whatever the logical screen says.
        assert_eq!(image_size(&gif((1, 1), &[(0, 0, 30000, 30000)])), Some((30000, 30000)));
        assert_eq!(image_size(&gif((20, 10), &[(0, 0, 4, 4), (0, 0, 8, 30)])), Some((20, 30)), "after a local color table");
        assert_eq!(image_size(&gif((20, 10), &[(0, 0, 4, 4), (0, 0, 4, 4), (0, 0, 50, 5)])), Some((50, 10)), "the last frame");
        assert_eq!(image_size(&gif((10, 10), &[(100, 5, 10, 10)])), Some((110, 15)), "a frame's offset grows the canvas");
        // JPEG: the EXIF thumbnail's SOF is skipped with its segment.
        assert_eq!(image_size(&jpeg(0xC0, 30000, 30000)), Some((30000, 30000)));
        assert_eq!(image_size(&jpeg(0xC2, 800, 600)), Some((800, 600)), "progressive");
        assert_eq!(image_size(&jpeg(0xCF, 7, 9)), Some((7, 9)));
        // ICO: the largest entry, in either order, PNG or DIB (half height: the mask).
        assert_eq!(image_size(&ico(&[dib(16, 32), png(30000, 30000)])), Some((30000, 30000)));
        assert_eq!(image_size(&ico(&[png(30000, 30000), dib(16, 32)])), Some((30000, 30000)));
        assert_eq!(image_size(&ico(&[dib(16, 32), dib(48, 96), dib(32, 64)])), Some((48, 48)));

        // Cut short, in each format: none can be sized.
        let cut = |b: Vec<u8>, keep: usize| b[..keep].to_vec();
        for (name, short) in [
            ("png", cut(png(640, 480), 22)),
            ("bmp", cut(bmp(300, 200), 24)),
            ("vp8", cut(vp8(320, 240), 28)),
            ("vp8l", cut(vp8l(320, 240), 22)),
            ("vp8x", cut(vp8x(320, 240), 28)),
            ("gif header", cut(gif((1, 1), &[]), 8)),
            ("gif frame", { let g = gif((1, 1), &[(0, 0, 30000, 30000)]); let n = g.len(); cut(g, n - 1) }),
            ("gif sub-block", { let g = gif((1, 1), &[(0, 0, 9, 9)]); let n = g.len(); cut(g, n - 4) }),
            ("jpeg", { let j = jpeg(0xC0, 30000, 30000); let n = j.len(); cut(j, n - 20) }),
            ("jpeg thumbnail only", cut(jpeg(0xC0, 30000, 30000), 30)),
            ("ico entry", { let i = ico(&[dib(16, 32), png(30000, 30000)]); let n = i.len(); cut(i, n - 1) }),
            ("ico directory", cut(ico(&[dib(16, 32)]), 12)),
        ] {
            assert_eq!(image_size(&short), None, "{name}");
        }
        // Not an image at all.
        let mut seed = 0x2545_F491_u32;
        let noise: Vec<u8> = (0..4096)
            .map(|_| {
                seed ^= seed << 13;
                seed ^= seed >> 17;
                seed ^= seed << 5;
                seed as u8
            })
            .collect();
        assert_eq!(image_size(&noise), None);
        assert_eq!(image_size(b""), None);
        assert_eq!(image_size(b"<svg/>"), None);
        // A zero dimension anywhere: never decoded.
        assert_eq!(image_size(&png(0, 480)), None);
        assert_eq!(image_size(&png(640, 0)), None);
        assert_eq!(image_size(&jpeg(0xC0, 640, 0)), None, "height deferred to DNL");
        assert_eq!(image_size(&bmp(0, 10)), None);
        assert_eq!(image_size(&vp8(0, 10)), None);
        assert_eq!(image_size(&gif((0, 10), &[(0, 0, 4, 4)])), None);
        assert_eq!(image_size(&gif((10, 10), &[(0, 0, 4, 0)])), None);
        assert_eq!(image_size(&ico(&[dib(16, 1)])), None, "half of 1 is 0");
    }

    /// `body` inside an `<svg>` root, after an XML declaration.
    fn svg(body: &str) -> String {
        format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\">\n{body}\n</svg>\n")
    }

    const GRADIENT: &str = "<defs><linearGradient id=\"g\"><stop offset=\"0\" stop-color=\"#fff\"/></linearGradient></defs>";

    #[test]
    fn images_are_capped_and_sized() {
        let dir = scratch("images");
        let write = |name: &str, bytes: &[u8]| {
            let p = dir.join(name);
            std::fs::write(&p, bytes).unwrap();
            p
        };
        let sized = |w: u32, h: u32, len: usize| Body::Bytes { length: len as u64, width: Some(w), height: Some(h) };
        let pixels = |w: u32, h: u32| Body::Skipped { reason: SkipReason::Pixels, width: Some(w), height: Some(h) };

        for (name, bytes, w, h) in [
            ("a.png", png(640, 480), 640, 480),
            ("a.gif", gif((1, 1), &[(0, 0, 64, 32)]), 64, 32),
            ("a.jpg", jpeg(0xC0, 1920, 1080), 1920, 1080),
            ("a.webp", vp8x(512, 256), 512, 256),
            ("a.bmp", bmp(40, -30), 40, 30),
            ("a.ico", ico(&[dib(16, 32), png(256, 256)]), 256, 256),
            // Exactly 40 megapixels is allowed.
            ("cap.png", png(8000, 5000), 8000, 5000),
        ] {
            let (p, payload) = peek_path(&write(name, &bytes), PeekKind::Image, None).unwrap();
            assert_eq!(p.body, sized(w, h, bytes.len()), "{name}");
            assert_eq!(payload, bytes, "{name}: the payload is the file");
            assert_eq!(p.size, bytes.len() as u64);
        }
        // The extension does not pick the parser: a JPEG named .png is sized as a JPEG.
        let (p, _) = peek_path(&write("jpeg.png", &jpeg(0xC0, 30, 20)), PeekKind::Image, None).unwrap();
        assert_eq!(p.body, sized(30, 20, jpeg(0xC0, 30, 20).len()));

        for (name, bytes, w, h) in [
            ("big.gif", gif((1, 1), &[(0, 0, 30000, 30000)]), 30000, 30000),
            ("big.jpg", jpeg(0xC0, 30000, 30000), 30000, 30000),
            ("big.ico", ico(&[dib(16, 32), png(30000, 30000)]), 30000, 30000),
            // 65536 x 65536 is 2^32: 0 in u32.
            ("wrap.png", png(65536, 65536), 65536, 65536),
            ("over.png", png(8000, 5001), 8000, 5001),
            // 40,000,001 pixels: one over.
            ("one-over.png", png(53, 754_717), 53, 754_717),
        ] {
            let (p, payload) = peek_path(&write(name, &bytes), PeekKind::Image, None).unwrap();
            assert_eq!(p.body, pixels(w, h), "{name}");
            assert!(payload.is_empty(), "{name}: no bytes sent");
        }

        for (name, bytes) in [("bad.png", b"\x89PNG\r\n\x1a\nnot really".to_vec()), ("zero.png", png(0, 10)), ("svg.png", svg("").into_bytes())] {
            let (p, payload) = peek_path(&write(name, &bytes), PeekKind::Image, None).unwrap();
            assert_eq!(p.body, Body::Skipped { reason: SkipReason::NoSize, width: None, height: None }, "{name}");
            assert!(payload.is_empty());
        }

        // Size caps, from the stat: a sparse file is never read.
        let sparse = |name: &str, len: u64, head: &[u8]| {
            let p = write(name, head);
            File::options().write(true).open(&p).unwrap().set_len(len).unwrap();
            p
        };
        let (p, payload) = peek_path(&sparse("huge.png", 10_000_001, &png(10, 10)), PeekKind::Image, None).unwrap();
        assert_eq!(p.body, Body::TooLarge { limit: 10_000_000 });
        assert_eq!(p.size, 10_000_001);
        assert!(payload.is_empty());
        let (p, payload) = peek_path(&sparse("edge.png", 10_000_000, &png(10, 10)), PeekKind::Image, None).unwrap();
        assert_eq!(p.body, sized(10, 10, 10_000_000), "exactly the cap is read");
        assert_eq!(payload.len(), 10_000_000);
        // The SVG cap is not the raster cap.
        let (p, _) = peek_path(&sparse("mid.png", 1_000_001, &png(10, 10)), PeekKind::Image, None).unwrap();
        assert_eq!(p.body, sized(10, 10, 1_000_001));
    }

    #[test]
    fn svg_allowlist_rejects_every_bypass() {
        let dir = scratch("svg");
        let plain = svg(&format!(
            "{GRADIENT}<rect x=\"1\" y=\"1\" width=\"40\" height=\"30\" fill=\"#4a90d9\" stroke=\"black\"/>\n<path d=\"M10 80 L50 20 L90 80 Z\" fill=\"none\" stroke-width=\"2\"/>\n<text x=\"5\" y=\"95\" font-style=\"italic\" font-size=\"8\">Q3 &amp; Q4 &lt;draft&gt; &quot;a&quot; &apos;b&apos;</text>"
        ));
        let accepted = [
            ("a plain chart", plain.clone()),
            ("a gradient", svg(&format!("{GRADIENT}<rect width=\"9\" height=\"9\" fill=\"url(#g)\"/>"))),
            ("spaces in url()", svg(&format!("{GRADIENT}<rect fill=\"url( #g )\" stroke=\"URL(#g)\"/>"))),
            ("quoted url()", svg(&format!("{GRADIENT}<rect fill=\"url('#g')\" clip-path='url(\"#c.1_a:b-2\")'/>"))),
            ("a <user> element", svg("<user/><images/><styles/>")),
            ("no declaration", "<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"4\"/></svg>".into()),
            ("a UTF-8 BOM", format!("\u{FEFF}{plain}")),
            ("encoding utf-8, single quotes", plain.replace("encoding=\"UTF-8\"", "encoding='utf-8'")),
            ("a prefixed attribute", svg("<a xlink:href=\"#x\"><rect/></a>")),
        ];
        for (name, text) in &accepted {
            assert!(svg_is_plain(text.as_bytes()), "{name} should pass");
        }

        let png_data = "data:image/png;base64,iVBORw0KGgo=";
        let utf16: Vec<u8> = [0xFF, 0xFE].into_iter().chain(plain.encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        let rejected: Vec<(&str, Vec<u8>)> = [
            ("<use>", svg(&format!("{GRADIENT}<use href=\"#g\"/>"))),
            ("<use/>", svg("<use/>")),
            ("<use> then a newline", svg("<use\nhref=\"#g\"/>")),
            ("<use> then a tab", svg("<use\thref=\"#g\"/>")),
            ("<USE>", svg("<USE href=\"#g\"></USE>")),
            ("<image>", svg("<image href=\"a.png\" width=\"9\" height=\"9\"/>")),
            ("<feImage>", svg("<filter id=\"f\"><feImage href=\"a.png\"/></filter>")),
            ("<svg:use>", svg("<svg:use href=\"#g\"/>")),
            ("<svg:image>", svg("<svg:image href=\"a.png\"/>")),
            ("a prefixed element", svg("<x:rect/>")),
            ("a prefixed end tag", svg("<rect></x:rect>")),
            ("a prefix with a '-'", svg("<a-b:use href=\"#g\"/>")),
            ("a prefix with a '.'", svg("<a.b:image href=\"a.png\"/>")),
            ("a non-ASCII prefix", svg("<é:use href=\"#g\"/>")),
            ("encoding UTF-16", plain.replace("UTF-8", "UTF-16")),
            ("encoding ISO-2022-JP", plain.replace("UTF-8", "ISO-2022-JP")),
            ("an unterminated encoding", plain.replace("encoding=\"UTF-8\"", "encoding=\"UTF-8")),
            ("<foreignObject> with CSS", svg("<foreignObject width=\"9\" height=\"9\"><div xmlns=\"http://www.w3.org/1999/xhtml\" style=\"background:url(a.png)\"/></foreignObject>")),
            ("<foreignObject>", svg("<foreignObject width=\"9\" height=\"9\"><div xmlns=\"http://www.w3.org/1999/xhtml\">hi</div></foreignObject>")),
            ("data: in a style attribute", svg(&format!("<rect style=\"mask-image:url({png_data})\"/>"))),
            ("data: in a <style>", svg(&format!("<style>rect{{mask-image:url({png_data})}}</style>"))),
            ("data: behind a character reference", svg("<rect fill=\"url(#g)\" mask=\"&#100;ata:image/png;base64,AAAA\"/>")),
            ("a hex character reference", svg("<text>&#x41;</text>")),
            ("url( behind a CSS escape", svg("<rect style=\"mask-image:u\\72l(a.png)\"/>")),
            ("a backslash", svg("<text>C:\\temp</text>")),
            ("an internal <!ENTITY>", plain.replace("<svg ", "<!DOCTYPE svg [<!ENTITY big \"x\">]>\n<svg ")),
            ("a named entity", svg("<text>a&nbsp;b</text>")),
            ("a bare ampersand", svg("<text>a & b</text>")),
            ("a comment split in a <style>", svg(&format!("<style>rect{{-webkit-mask-image:ur<!---->l(da<!---->ta:{})}}</style>", &png_data[5..]))),
            ("a CDATA split", svg("<style>rect{mask-image:ur<![CDATA[l(]]>a.png)}</style>")),
            ("an @import split", svg("<style>@import \"da<!---->ta:text/css,rect{}\";</style>")),
            ("a <style> with no url(", svg("<style>rect{fill:red}</style>")),
            ("a <STYLE/>", svg("<STYLE/>")),
            ("a style attribute", svg("<rect style=\"fill:red\"/>")),
            ("a style attribute, spaced", svg("<rect\nstyle = 'fill:red'/>")),
            ("a comment", svg("<!-- drawn by hand -->")),
            ("a CDATA section", svg("<text><![CDATA[x]]></text>")),
            ("a processing instruction", svg("<?foo bar?>")),
            ("<?xml-stylesheet?> at offset 0", format!("<?xml-stylesheet href=\"x.css\"?>\n{}", svg("").split_once('\n').unwrap().1)),
            ("an XML declaration not at offset 0", format!("\n{plain}")),
            ("a second XML declaration", svg("<?xml version=\"1.0\"?>")),
            ("url(data:)", svg(&format!("<rect fill=\"url({png_data})\"/>"))),
            ("url(http:)", svg("<rect fill=\"url(http://example.com/a.svg#g)\"/>")),
            ("url(file#id)", svg("<rect fill=\"url(g.svg#x)\"/>")),
            ("url(#) with no id", svg("<rect fill=\"url(#)\"/>")),
            ("url(#id) unclosed", svg("<rect fill=\"url(#g\"/>")),
            ("url(#id x)", svg("<rect fill=\"url(#g x)\"/>")),
            ("url() with mismatched quotes", svg("<rect fill='url(\"#g)'/>")),
            ("url(#id\") with no opening quote", svg("<rect fill='url(#g\")'/>")),
            ("a fragment url() and data: elsewhere", svg(&format!("{GRADIENT}<rect fill=\"url(#g)\"/><text>{png_data}</text>"))),
        ]
        .into_iter()
        .map(|(name, text)| (name, text.into_bytes()))
        .chain([
            ("UTF-16 LE with a BOM", utf16),
            ("Latin-1", svg("<text>caf\u{1}</text>").into_bytes().into_iter().map(|b| if b == 1 { 0xE9 } else { b }).collect()),
            ("a NUL", svg("<text>a\0b</text>").into_bytes()),
        ])
        .collect();
        for (name, bytes) in &rejected {
            assert!(!svg_is_plain(bytes), "{name} should be rejected");
        }

        // Through `peek_file`: bytes, skipped with nothing sent, or too large.
        let (p, payload) = peek_path(&{ let f = dir.join("chart.svg"); std::fs::write(&f, &plain).unwrap(); f }, PeekKind::Image, None).unwrap();
        assert_eq!(p.body, Body::Bytes { length: plain.len() as u64, width: None, height: None });
        assert_eq!(payload, plain.as_bytes());
        let f = dir.join("sprite.SVG");
        std::fs::write(&f, svg("<use href=\"#g\"/>")).unwrap();
        let (p, payload) = peek_path(&f, PeekKind::Image, None).unwrap();
        assert_eq!(p.body, Body::Skipped { reason: SkipReason::SvgFeatures, width: None, height: None });
        assert!(payload.is_empty());
        let padded = |len: usize| {
            let mut s = plain.clone();
            s.push_str(&" ".repeat(len - plain.len()));
            s
        };
        let f = dir.join("edge.svg");
        std::fs::write(&f, padded(1_000_000)).unwrap();
        assert_eq!(peek_path(&f, PeekKind::Image, None).unwrap().0.body, Body::Bytes { length: 1_000_000, width: None, height: None });
        std::fs::write(&f, padded(1_000_001)).unwrap();
        let (p, payload) = peek_path(&f, PeekKind::Image, None).unwrap();
        assert_eq!(p.body, Body::TooLarge { limit: 1_000_000 });
        assert!(payload.is_empty());
    }

    /// `f` on its own thread; `None` if it takes longer than `limit` (the
    /// thread is left to finish, so a slow regression fails instead of hanging).
    fn within<T: Send + 'static>(limit: Duration, f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(f());
        });
        rx.recv_timeout(limit).ok()
    }

    #[test]
    fn svg_allowlist_is_linear() {
        // 1 MB (the SVG cap) of one piece, repeated: each is a shape where a
        // check made per `<`, `&`, `url(`, `style` or `<!doctype` could rescan
        // what follows it. The bound is generous for a debug build; a release
        // build takes a few milliseconds.
        let pieces = ["<", "<a", "</", "</a", "<a:", "<s", "<use", "<!doctype", "<!doctype [", "url(#a)", "url( ", " style", " style ", "&amp;", "&", "<?xml ", "a", " "];
        for piece in pieces {
            let bytes = piece.repeat(SVG_CAP / piece.len()).into_bytes();
            let started = std::time::Instant::now();
            let done = within(Duration::from_secs(2), move || svg_is_plain(&bytes));
            assert!(done.is_some(), "{piece:?} x 1 MB took over 2 s");
            eprintln!("svg_is_plain({piece:?} x 1 MB): {:?}", started.elapsed());
        }
    }

    /// SOI, `segments`, then SOS and EOI.
    fn jpeg_of(segments: &[Vec<u8>]) -> Vec<u8> {
        let mut b = vec![0xFF, 0xD8];
        for s in segments {
            b.extend(s);
        }
        b.extend([0xFF, 0xDA, 0, 2, 0xAB, 0xFF, 0xD9]);
        b
    }

    #[test]
    fn image_header_edges() {
        // JPEG: DHT, JPG and DAC sit in the SOF range but are not frame
        // headers, though their bytes here read as 30000 x 30000.
        for marker in [0xC4, 0xC8, 0xCC] {
            let table = vec![0xFF, marker, 0, 8, 0x00, 0x75, 0x30, 0x75, 0x30, 0x00];
            assert_eq!(image_size(&jpeg_of(&[table, jpeg_sof(0xC0, 10, 10)])), Some((10, 10)), "{marker:#X}");
        }
        // The largest frame header before the scan, in either order.
        let (small, big) = (jpeg_sof(0xC0, 1, 1), jpeg_sof(0xC2, 30000, 30000));
        assert_eq!(image_size(&jpeg_of(&[small.clone(), big.clone()])), Some((30000, 30000)));
        assert_eq!(image_size(&jpeg_of(&[big, small])), Some((30000, 30000)));
        assert_eq!(image_size(&jpeg_of(&[jpeg_sof(0xC0, 40, 5), jpeg_sof(0xC1, 6, 40)])), Some((6, 40)), "by area");
        assert_eq!(image_size(&jpeg_of(&[jpeg_sof(0xC0, 40, 5), jpeg_sof(0xC1, 6, 0)])), None, "a zero side in any");
        // Nothing after the scan is a segment: its bytes are image data.
        let mut after_scan = vec![0xFF, 0xD8];
        after_scan.extend(jpeg_sof(0xC0, 10, 10));
        after_scan.extend([0xFF, 0xDA, 0, 2, 0xAB]);
        after_scan.extend(jpeg_sof(0xC0, 30000, 30000));
        assert_eq!(image_size(&after_scan), Some((10, 10)));
        assert_eq!(image_size(&jpeg_of(&[])), None, "a scan with no frame header");

        // ICO: no entries; a PNG entry whose first chunk is not IHDR; CUR, and no other type.
        assert_eq!(image_size(&ico(&[])), None);
        let mut no_ihdr = png(30000, 30000);
        no_ihdr[12..16].copy_from_slice(b"IDAT");
        assert_eq!(image_size(&ico(&[dib(16, 32), no_ihdr.clone()])), None);
        let mut cur = ico(&[png(64, 64)]);
        cur[2] = 2;
        assert_eq!(image_size(&cur), Some((64, 64)));
        cur[2] = 3;
        assert_eq!(image_size(&cur), None);
        // PNG: the first chunk must be IHDR.
        assert_eq!(image_size(&no_ihdr), None);
        // GIF: an unknown block ends the walk with no size.
        let mut odd = gif((10, 10), &[(0, 0, 4, 4)]);
        odd.pop();
        odd.extend([0x99, 0x3B]);
        assert_eq!(image_size(&odd), None);

        // BMP: the 12-byte core header has 16-bit sizes; 16 bytes and longer, 32-bit; nothing shorter.
        let bmp_with = |header: u32, sizes: &[u8]| {
            let mut b = b"BM".to_vec();
            b.extend([0; 12]);
            b.extend(header.to_le_bytes());
            b.extend(sizes);
            b.extend([1, 0, 24, 0, 0, 0, 0, 0]);
            b
        };
        let core: Vec<u8> = [300u16.to_le_bytes(), 200u16.to_le_bytes()].concat();
        let info: Vec<u8> = [300i32.to_le_bytes(), (-200i32).to_le_bytes()].concat();
        assert_eq!(image_size(&bmp_with(12, &core)), Some((300, 200)));
        assert_eq!(image_size(&bmp_with(16, &info)), Some((300, 200)));
        assert_eq!(image_size(&bmp_with(124, &info)), Some((300, 200)));
        for header in [0, 11, 13, 15] {
            assert_eq!(image_size(&bmp_with(header, &info)), None, "header size {header}");
        }

        // WebP: each chunk's signature, and the 14-bit size fields.
        let mut v = vp8(320, 240);
        v[23] = 0; // the start code
        assert_eq!(image_size(&v), None);
        assert_eq!(image_size(&vp8(0xC000 | 320, 0x4000 | 240)), Some((320, 240)), "scale bits are not size");
        let mut v = vp8l(320, 240);
        v[20] = 0x2E; // the signature
        assert_eq!(image_size(&v), None);
        let mut d = vec![0x2F];
        d.extend((319 | 239 << 14 | 0xF000_0000u32).to_le_bytes()); // alpha and version bits set
        assert_eq!(image_size(&webp(b"VP8L", &d)), Some((320, 240)));
        assert_eq!(image_size(&webp(b"VP9 ", &[0; 10])), None);
    }

    #[test]
    fn svg_allowlist_rejects_dtds_and_image_set() {
        let doctype = "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n";
        let accepted = [
            ("an external DOCTYPE", svg("").replacen("<svg ", &format!("{doctype}<svg "), 1)),
            ("brackets in the text", svg("<text>[draft] (v2)</text>")),
        ];
        for (name, text) in &accepted {
            assert!(svg_is_plain(text.as_bytes()), "{name} should pass");
        }
        let rejected = [
            // libxml2 applies an ATTLIST's default attributes, so CSS gets in.
            ("an ATTLIST default style", svg("<rect/>").replacen("<svg ", "<!DOCTYPE svg [<!ATTLIST rect style CDATA \"fill:red\">]>\n<svg ", 1)),
            ("an empty internal subset", svg("").replacen("<svg ", "<!DOCTYPE svg [ ]>\n<svg ", 1)),
            ("an ATTLIST behind a quoted >", svg("").replacen("<svg ", "<!DOCTYPE svg SYSTEM \"a><svg\" [<!ATTLIST svg x CDATA \"y\">]>\n<svg ", 1)),
            ("an ENTITY behind a quoted >", svg("").replacen("<svg ", "<!DOCTYPE svg SYSTEM \"a><svg\" [<!ENTITY big \"x\">]>\n<svg ", 1)),
            ("image-set()", svg("<rect fill=\"image-set('a.png' 1x)\"/>")),
            ("-webkit-image-set()", svg("<rect fill=\"-webkit-image-set('a.png' 1x)\"/>")),
            ("an XML declaration with no ?>", svg("").replacen("?>", "", 1)),
        ];
        for (name, text) in &rejected {
            assert!(!svg_is_plain(text.as_bytes()), "{name} should be rejected");
        }
    }

    #[test]
    fn image_caps_are_checked_before_reading() {
        struct Counting<R> {
            inner: R,
            given: u64,
        }
        impl<R: Read> Read for Counting<R> {
            fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
                let n = self.inner.read(buf)?;
                self.given += n as u64;
                Ok(n)
            }
        }
        let denied = || Err::<io::Empty, _>(io::Error::other("permission denied"));

        // Over the cap by the stat: the file is not opened, let alone read,
        // so one that can't be opened is still `tooLarge`, not an error.
        for (name, size, limit) in [("huge.png", 10_000_001, 10_000_000), ("huge.svg", 1_000_001, 1_000_000)] {
            let mut opened = false;
            let open = || {
                opened = true;
                Ok(io::empty())
            };
            let (body, payload) = image_body(Path::new(name), size, open).unwrap();
            assert_eq!(body, Body::TooLarge { limit }, "{name}");
            assert!(!opened && payload.is_empty(), "{name}");
            assert_eq!(image_body(Path::new(name), size, denied).unwrap().0, Body::TooLarge { limit });
        }
        // Within the cap by the stat, an open that fails is the error.
        assert_eq!(image_body(Path::new("small.png"), 10, denied).unwrap_err(), "permission denied");

        // It grew after the stat: the read stops at cap + 1 and says so.
        for (name, limit) in [("growing.png", 10_000_000), ("growing.svg", 1_000_000)] {
            let mut endless = Counting { inner: io::repeat(b'<'), given: 0 };
            let (body, payload) = image_body(Path::new(name), 10, || Ok(&mut endless)).unwrap();
            assert_eq!(body, Body::TooLarge { limit }, "{name}");
            assert!(payload.is_empty());
            assert!(endless.given <= limit + 1, "{name}: asked for {} bytes", endless.given);
        }
    }

    #[test]
    fn the_command_reads_on_the_blocking_pool() {
        use tauri::ipc::{InvokeResponseBody, IpcResponse};
        let dir = scratch("command");
        let f = dir.join("a.txt");
        std::fs::write(&f, "hello").unwrap();
        let path = f.to_string_lossy().into_owned();
        let response = tauri::async_runtime::block_on(peek_file(path, PeekKind::Text, None)).unwrap();
        let Ok(InvokeResponseBody::Raw(bytes)) = response.body() else { panic!("a raw frame") };
        assert_eq!(bytes, frame(&peek_path(&f, PeekKind::Text, None).unwrap().0, &[]));
        let missing = dir.join("missing.txt").to_string_lossy().into_owned();
        assert!(tauri::async_runtime::block_on(peek_file(missing, PeekKind::Text, None)).is_err());

        // The read runs on tauri's blocking pool, so a slow file (a network
        // mount, a pathological SVG) never holds a shared async worker.
        let source = include_str!("filepeek.rs");
        let command = source.split("pub async fn peek_file(").nth(1).expect("an async command").split("\n}\n").next().unwrap();
        assert!(command.contains("tauri::async_runtime::spawn_blocking(move ||"), "{command}");
    }

    /// The `hex` block of the contract file, as bytes.
    fn contract_vector() -> Vec<u8> {
        let doc = include_str!("../../.ade/context/file-peek.md");
        let block = doc.split("```hex").nth(1).expect("a ```hex block").split("```").next().unwrap();
        block.split_whitespace().map(|h| u8::from_str_radix(h, 16).unwrap()).collect()
    }

    #[test]
    fn frame_matches_the_contract_vector() {
        let peek = FilePeek {
            size: 2,
            modified_ms: Some(-1500),
            stamp: "2:-1500000000:-1500000000:66306:42".into(),
            body: Body::Text { text: "é".into(), truncated: false },
        };
        let vector = contract_vector();
        assert_eq!(vector.len(), 4 + 127);
        assert_eq!(frame(&peek, &[]), vector);
        let with_payload = [vector.as_slice(), &[0x00, 0xFF, 0x7F]].concat();
        assert_eq!(frame(&peek, &[0x00, 0xFF, 0x7F]), with_payload, "the payload follows the header");
    }

    #[test]
    fn bodies_and_kinds_match_the_typescript_union() {
        let json = |b: Body| serde_json::to_string(&b).unwrap();
        assert_eq!(json(Body::Binary), r#"{"type":"binary"}"#);
        assert_eq!(json(Body::Unchanged), r#"{"type":"unchanged"}"#);
        assert_eq!(json(Body::None), r#"{"type":"none"}"#);
        // Built on macOS only in production, so pinned here for every platform.
        assert_eq!(
            json(Body::Skipped { reason: SkipReason::NotDownloaded, width: None, height: None }),
            r#"{"type":"skipped","reason":"notDownloaded"}"#
        );
        assert_eq!(
            json(Body::Skipped { reason: SkipReason::Pixels, width: Some(30000), height: Some(20000) }),
            r#"{"type":"skipped","reason":"pixels","width":30000,"height":20000}"#
        );
        assert_eq!(json(Body::Skipped { reason: SkipReason::NoSize, width: None, height: None }), r#"{"type":"skipped","reason":"noSize"}"#);
        assert_eq!(
            json(Body::Skipped { reason: SkipReason::SvgFeatures, width: None, height: None }),
            r#"{"type":"skipped","reason":"svgFeatures"}"#
        );
        assert_eq!(json(Body::TooLarge { limit: 10_000_000 }), r#"{"type":"tooLarge","limit":10000000}"#);
        assert_eq!(
            json(Body::Bytes { length: 9, width: Some(3), height: Some(2) }),
            r#"{"type":"bytes","length":9,"width":3,"height":2}"#
        );
        assert_eq!(json(Body::Bytes { length: 9, width: None, height: None }), r#"{"type":"bytes","length":9}"#);
        for (s, kind) in [("text", PeekKind::Text), ("image", PeekKind::Image), ("pdf", PeekKind::Pdf), ("html", PeekKind::Html), ("meta", PeekKind::Meta)] {
            assert_eq!(serde_json::from_str::<PeekKind>(&format!("\"{s}\"")).unwrap(), kind);
        }
    }
}
