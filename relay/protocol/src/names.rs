//! Name cleaning (spec, "Names"): the Mac's `n` and the phone's name in the reveal.

/// At most this many code points survive cleaning.
const MAX_NAME_CODE_POINTS: usize = 40;

/// Step 1's list. Surrogates (U+D800-DFFF) can't occur in a `str`.
const REMOVED: [(u32, u32); 18] = [
    (0x0000, 0x001F),
    (0x007F, 0x009F),
    (0x00AD, 0x00AD),
    (0x061C, 0x061C),
    (0x180E, 0x180E),
    (0x115F, 0x1160),
    (0x200B, 0x200C),
    (0x200E, 0x200F),
    (0x2028, 0x202E),
    (0x2060, 0x206F),
    (0x3164, 0x3164),
    (0xD800, 0xDFFF),
    (0xE000, 0xF8FF),
    (0xFEFF, 0xFEFF),
    (0xFFA0, 0xFFA0),
    (0xFFF0, 0xFFFF),
    (0xE0000, 0xE007F),
    (0xF0000, 0x10FFFF),
];

/// Step 2's list, the characters trimmed from both ends.
const TRIMMED: [(u32, u32); 7] = [
    (0x0020, 0x0020),
    (0x00A0, 0x00A0),
    (0x1680, 0x1680),
    (0x2000, 0x200A),
    (0x202F, 0x202F),
    (0x205F, 0x205F),
    (0x3000, 0x3000),
];

fn in_list(list: &[(u32, u32)], c: char) -> bool {
    let c = c as u32;
    list.iter().any(|&(lo, hi)| lo <= c && c <= hi)
}

fn is_trimmed(c: &char) -> bool {
    in_list(&TRIMMED, *c)
}

fn trim_end(chars: &mut Vec<char>) {
    while chars.last().is_some_and(is_trimmed) {
        chars.pop();
    }
}

/// The spec's four steps: remove the listed code points, trim, cut to 40 code
/// points, trim the end again. Uses the spec's own lists, never `trim`.
pub fn clean_name(name: &str) -> String {
    // 1. Remove.
    let kept = name.chars().filter(|&c| !in_list(&REMOVED, c));
    // 2. Trim both ends.
    let mut chars: Vec<char> = kept.skip_while(is_trimmed).collect();
    trim_end(&mut chars);
    // 3. Cut. 4. Trim the end again.
    chars.truncate(MAX_NAME_CODE_POINTS);
    trim_end(&mut chars);
    chars.into_iter().collect()
}

/// A name received as bytes: decoded as UTF-8 with each maximal invalid subpart
/// replaced by U+FFFD (which cleaning then removes), then cleaned.
pub fn name_from_bytes(bytes: &[u8]) -> String {
    clean_name(&String::from_utf8_lossy(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plain_name_is_kept() {
        assert_eq!(clean_name("Mac mini"), "Mac mini");
        assert_eq!(name_from_bytes(b"Mac mini"), "Mac mini");
    }
}
