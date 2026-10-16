//! The one encoding every signed and sealed structure uses.

/// `enc(label, f1, ..., fn) = label_ascii || u32be(len f1) || f1 || ... || u32be(len fn) || fn`.
pub fn enc(label: &str, fields: &[&[u8]]) -> Vec<u8> {
    let mut out = label.as_bytes().to_vec();
    for field in fields {
        out.extend_from_slice(&(field.len() as u32).to_be_bytes());
        out.extend_from_slice(field);
    }
    out
}

/// The inverse of `enc`: the fields, if `bytes` starts with exactly `label` and the
/// length-prefixed fields then use up the whole input.
pub fn dec<'a>(label: &str, bytes: &'a [u8]) -> Option<Vec<&'a [u8]>> {
    let mut rest = bytes.strip_prefix(label.as_bytes())?;
    let mut fields = Vec::new();
    while !rest.is_empty() {
        let (len, tail) = rest.split_first_chunk::<4>()?;
        let len = u32::from_be_bytes(*len) as usize;
        if len > tail.len() {
            return None;
        }
        let (field, tail) = tail.split_at(len);
        fields.push(field);
        rest = tail;
    }
    Some(fields)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dec_inverts_enc() {
        let fields: [&[u8]; 3] = [b"ab", b"", &[0xff; 300]];
        let out = enc("ade-remote/v1/x", &fields);
        assert_eq!(dec("ade-remote/v1/x", &out), Some(fields.to_vec()));
    }

    #[test]
    fn dec_refuses_another_label_and_leftovers() {
        let out = enc("ade-remote/v1/pair/commit", &[b"h"]);
        assert_eq!(dec("ade-remote/v1/pair/nonce", &out), None);
        assert_eq!(dec("ade-remote/v1/pair/commit-hash", &out), None);
        let mut longer = out.clone();
        longer.push(0);
        assert_eq!(dec("ade-remote/v1/pair/commit", &longer), None);
        assert_eq!(
            dec("ade-remote/v1/pair/commit", &out[..out.len() - 1]),
            None
        );
    }

    #[test]
    fn dec_refuses_a_length_past_the_end_without_overflow() {
        let mut out = b"l".to_vec();
        out.extend_from_slice(&[0xff, 0xff, 0xff, 0xff, 1]);
        assert_eq!(dec("l", &out), None);
    }
}
