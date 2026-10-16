//! The pairing QR code: `ade-pair://v1?relay=..&slot=..&id=..&x=..&s=..&n=..`.
//! The grammar, its errors and their precedence are in `.ade/context/remote-protocol.md`.

use crate::names::{clean_name, name_from_bytes};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

const PREFIX: &str = "ade-pair://v";
const SECURE_SCHEME: &str = "wss://";

/// A parsed pairing code.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PairCode {
    /// The relay URL, always `wss://` plus at least one character.
    pub relay: String,
    pub slot: [u8; 16],
    /// `I_M`, the Mac's Ed25519 identity key.
    pub id: [u8; 32],
    /// `S_M`, the Mac's X25519 static key.
    pub x: [u8; 32],
    /// The pairing secret.
    pub s: [u8; 32],
    /// The Mac's cleaned name; `None` shows as "Mac".
    pub name: Option<String>,
}

/// Why a string is not a code this app can pair with.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PairCodeError {
    NotPairingCode,
    InsecureRelay,
    NewerVersion,
}

impl PairCodeError {
    /// The error's name in the vectors and the TypeScript twin.
    pub fn as_str(self) -> &'static str {
        match self {
            PairCodeError::NotPairingCode => "not_pairing_code",
            PairCodeError::InsecureRelay => "insecure_relay",
            PairCodeError::NewerVersion => "newer_version",
        }
    }
}

/// Builds a code. `name` is cleaned first and `n` left out if it cleans to empty.
pub fn build_pair_code(
    relay: &str,
    slot: &[u8; 16],
    id: &[u8; 32],
    x: &[u8; 32],
    s: &[u8; 32],
    name: &str,
) -> Result<String, PairCodeError> {
    check_relay(relay.as_bytes())?;
    let mut code = format!(
        "{PREFIX}1?relay={}&slot={}&id={}&x={}&s={}",
        percent_encode(relay.as_bytes()),
        URL_SAFE_NO_PAD.encode(slot),
        URL_SAFE_NO_PAD.encode(id),
        URL_SAFE_NO_PAD.encode(x),
        URL_SAFE_NO_PAD.encode(s),
    );
    let name = clean_name(name);
    if !name.is_empty() {
        code.push_str("&n=");
        code.push_str(&percent_encode(name.as_bytes()));
    }
    Ok(code)
}

/// Parses a code. Structure errors win over `InsecureRelay`.
pub fn parse_pair_code(code: &str) -> Result<PairCode, PairCodeError> {
    use PairCodeError::*;
    // The version comes first: v2 and up are `NewerVersion` whatever follows.
    let after = code.strip_prefix(PREFIX).ok_or(NotPairingCode)?;
    let digits = after.bytes().take_while(u8::is_ascii_digit).count();
    let (version, rest) = after.split_at(digits);
    if version.is_empty() || version.starts_with('0') {
        return Err(NotPairingCode);
    }
    if version != "1" {
        return Err(NewerVersion);
    }
    if !code.bytes().all(|b| (0x21..=0x7E).contains(&b)) {
        return Err(NotPairingCode);
    }
    let query = rest.strip_prefix('?').ok_or(NotPairingCode)?;

    let mut relay = None;
    let mut slot = None;
    let mut id = None;
    let mut x = None;
    let mut s = None;
    let mut names = Vec::new();
    for param in query.split('&') {
        let (key, value) = param.split_once('=').ok_or(NotPairingCode)?;
        let target = match key {
            "" => return Err(NotPairingCode),
            "relay" => &mut relay,
            "slot" => &mut slot,
            "id" => &mut id,
            "x" => &mut x,
            "s" => &mut s,
            "n" => {
                names.push(value);
                continue;
            }
            _ => continue,
        };
        if target.replace(value).is_some() {
            return Err(NotPairingCode);
        }
    }

    let relay = percent_decode(relay.ok_or(NotPairingCode)?).ok_or(NotPairingCode)?;
    let slot = field::<16>(slot)?;
    let id = field::<32>(id)?;
    let x = field::<32>(x)?;
    let s = field::<32>(s)?;
    check_relay(&relay)?;
    let relay = String::from_utf8(relay).expect("checked to be ASCII");

    // A missing, duplicated or malformed `n`, or one that cleans to empty, is no name.
    let name = match names.as_slice() {
        [one] => percent_decode(one)
            .map(|bytes| name_from_bytes(&bytes))
            .filter(|name| !name.is_empty()),
        _ => None,
    };
    Ok(PairCode {
        relay,
        slot,
        id,
        x,
        s,
        name,
    })
}

/// A relay is one or more characters 0x21-0x7E (else `NotPairingCode`), then
/// exactly `wss://` and at least one more character (else `InsecureRelay`).
fn check_relay(relay: &[u8]) -> Result<(), PairCodeError> {
    if relay.is_empty() || !relay.iter().all(|b| (0x21..=0x7E).contains(b)) {
        return Err(PairCodeError::NotPairingCode);
    }
    if relay.len() <= SECURE_SCHEME.len() || !relay.starts_with(SECURE_SCHEME.as_bytes()) {
        return Err(PairCodeError::InsecureRelay);
    }
    Ok(())
}

/// A required byte field: present once, strict percent-decoding, then canonical
/// unpadded base64url of exactly `N` bytes.
fn field<const N: usize>(value: Option<&str>) -> Result<[u8; N], PairCodeError> {
    let text = percent_decode(value.ok_or(PairCodeError::NotPairingCode)?)
        .ok_or(PairCodeError::NotPairingCode)?;
    URL_SAFE_NO_PAD
        .decode(text)
        .ok()
        .and_then(|raw| raw.try_into().ok())
        .ok_or(PairCodeError::NotPairingCode)
}

fn is_unreserved(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~')
}

/// Escapes every byte outside `A-Z a-z 0-9 - . _ ~`, in upper-case hex.
fn percent_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 3);
    for &b in bytes {
        if is_unreserved(b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Strict: every `%` is followed by two hex digits, in either case. `+` is literal.
fn percent_decode(text: &str) -> Option<Vec<u8>> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes.get(i + 1..i + 3)?;
            let hex = std::str::from_utf8(hex).ok()?;
            if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
                return None;
            }
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_built_code_parses_back() {
        let code = build_pair_code(
            "wss://r.example",
            &[1; 16],
            &[2; 32],
            &[3; 32],
            &[4; 32],
            "Mac",
        )
        .unwrap();
        let parsed = parse_pair_code(&code).unwrap();
        assert_eq!(
            parsed,
            PairCode {
                relay: "wss://r.example".into(),
                slot: [1; 16],
                id: [2; 32],
                x: [3; 32],
                s: [4; 32],
                name: Some("Mac".into()),
            }
        );
    }
}
