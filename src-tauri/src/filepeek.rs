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

// Only a macOS dataless file is skipped until images land (Story 3).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SkipReason {
    NotDownloaded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Body {
    Text { text: String, truncated: bool },
    Binary,
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    Skipped { reason: SkipReason },
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
            return Ok((peek(Body::Skipped { reason: SkipReason::NotDownloaded }), Vec::new()));
        }
    }
    let cap = match kind {
        PeekKind::Text => TEXT_CAP,
        PeekKind::Html => HTML_CAP,
        // Images and PDFs arrive with Stories 3 and 4; until then, details only.
        PeekKind::Image | PeekKind::Pdf | PeekKind::Meta => return Ok((peek(Body::None), Vec::new())),
    };
    let file = open_regular(path).map_err(|e| e.to_string())?;
    let (bytes, truncated) = read_bounded(file, cap).map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    Ok((peek(decode_text(&bytes, truncated)), Vec::new()))
}

#[tauri::command(async)]
pub fn peek_file(path: String, kind: PeekKind, known: Option<String>) -> Result<tauri::ipc::Response, String> {
    let (peek, payload) = peek_path(Path::new(&path), kind, known.as_deref())?;
    Ok(tauri::ipc::Response::new(frame(&peek, &payload)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::Duration;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ade-filepeek-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
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

        assert_eq!(text_of(&decode_text(b"a\xFFb", false)).0, "a\u{FFFD}b", "invalid UTF-8 inside is lossy");
        assert_eq!(text_of(&decode_text(b"one\r\ntwo\r\n", false)).0, "one\ntwo\n");

        let le: Vec<u8> = [0xFF, 0xFE].into_iter().chain("hé\r\n".encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        assert_eq!(text_of(&decode_text(&le, false)).0, "hé\n", "UTF-16 LE with a BOM");
        let be: Vec<u8> = [0xFE, 0xFF].into_iter().chain("hé\r\n".encode_utf16().flat_map(|u| u.to_be_bytes())).collect();
        assert_eq!(text_of(&decode_text(&be, false)).0, "hé\n", "UTF-16 BE with a BOM");
        let le_nul: Vec<u8> = [0xFF, 0xFE].into_iter().chain("a\0b".encode_utf16().flat_map(|u| u.to_le_bytes())).collect();
        assert_eq!(decode_text(&le_nul, false), Body::Binary, "a NUL character in UTF-16");
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
        }

        let old = dir.join("old.txt");
        std::fs::write(&old, "1969").unwrap();
        File::options().write(true).open(&old).unwrap().set_modified(UNIX_EPOCH - Duration::from_secs(86_400)).unwrap();
        let p = peek(&old, PeekKind::Text);
        assert_eq!(p.modified_ms, Some(-86_400_000));
        assert_eq!(peek_path(&old, PeekKind::Text, Some(&p.stamp)).unwrap().0.body, Body::Unchanged);
    }

    #[test]
    fn meta_and_pending_kinds() {
        let dir = scratch("meta");
        let f = dir.join("report.pdf");
        std::fs::write(&f, "%PDF-1.7 not really").unwrap();
        for kind in [PeekKind::Meta, PeekKind::Image, PeekKind::Pdf] {
            let (p, payload) = peek_path(&f, kind, None).unwrap();
            assert_eq!(p.body, Body::None, "{kind:?}");
            assert_eq!(p.size, 19);
            assert!(!p.stamp.is_empty());
            assert!(payload.is_empty());
        }
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
}
