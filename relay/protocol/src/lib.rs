//! Wire encodings, labels, pairing seals and Noise wiring for ADE's phone remote.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// The Noise pattern the phone and the Mac speak.
pub const NOISE_PATTERN: &str = "Noise_IK_25519_ChaChaPoly_SHA256";

/// The wire version every control message carries as `v`.
pub const VERSION: u8 = 1;

mod enc;
mod labels;
mod names;
mod noise;
mod qr;
mod routed;
mod sas;
mod seal;
mod sign;
#[cfg(test)]
mod vectors;

pub use enc::{dec, enc};
pub use labels::*;
pub use names::{clean_name, name_from_bytes};
pub use noise::{
    noise_prologue, read_hs1, FrameError, HandshakeError, Hs1Read, Initiator, Opened, Session,
    StaticKeypair, HS1_LEN, HS2_LEN, MAX_COUNTER, MAX_PLAINTEXT, NONCE_CEILING, SESSION_ID_LEN,
};
pub use qr::{build_pair_code, parse_pair_code, PairCode, PairCodeError};
pub use routed::{Routed, RoutedKind};
pub use sas::{sas_code, SasInputs};
pub use seal::{open, pair_keys, seal, PairKeys, NONCE_LEN, TAG_LEN};
pub use sign::{sign, verify};

/// Fixed-length bytes, carried on the wire as unpadded base64url.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Bytes<const N: usize>(pub [u8; N]);

impl<const N: usize> Serialize for Bytes<N> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&URL_SAFE_NO_PAD.encode(self.0))
    }
}

impl<'de, const N: usize> Deserialize<'de> for Bytes<N> {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let text = String::deserialize(d)?;
        let raw = URL_SAFE_NO_PAD
            .decode(text.as_bytes())
            .map_err(serde::de::Error::custom)?;
        let arr: [u8; N] = raw
            .try_into()
            .map_err(|_| serde::de::Error::custom(format!("expected {N} bytes")))?;
        Ok(Bytes(arr))
    }
}

/// A device's identity key `I` (Ed25519 public key).
pub type DeviceKey = Bytes<32>;
/// A pair's id, `SHA-256(R)[..16]`.
pub type PairId = Bytes<16>;

/// A device's role, fixed when its key first logs in.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Mac,
    Phone,
}

impl Role {
    /// The role's wire name, which is also the `role` field signed in a login.
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Mac => "mac",
            Role::Phone => "phone",
        }
    }
}

/// One pair, as `welcome` lists it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PairInfo {
    pub pair_id: PairId,
    pub peer_id: DeviceKey,
    pub peer_role: Role,
}

/// The control messages story 2 knows. Each is a JSON text frame `{"v":1,"t":...}`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Control {
    /// Relay → device: a fresh, single-use 32-byte challenge.
    Challenge { c: Bytes<32> },
    /// Device → relay: `sig = Sign(I, enc(LOGIN_LABEL, c, host, role))`.
    Login {
        id: DeviceKey,
        role: Role,
        sig: Bytes<64>,
    },
    /// Relay → device, after a good login.
    Welcome {
        pairs: Vec<PairInfo>,
        online: Vec<DeviceKey>,
    },
    /// Relay → device: a paired peer came online or left.
    Presence { peer: DeviceKey, online: bool },
}

/// Every `t` in `Control`, so an unknown one can be told apart from a malformed one.
const KNOWN_TYPES: [&str; 4] = ["challenge", "login", "welcome", "presence"];

#[derive(Serialize, Deserialize)]
struct Envelope<T> {
    v: u8,
    #[serde(flatten)]
    msg: T,
}

/// Why a text frame could not be read as a control message.
#[derive(Debug)]
pub enum DecodeError {
    /// The frame is not a control message this side knows.
    Malformed(serde_json::Error),
    /// The frame carries a `v` other than 1.
    Version(u64),
    /// A `v: 1` frame whose `t` this side doesn't know. Devices and the relay ignore it.
    UnknownType(String),
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::Malformed(e) => write!(f, "malformed control message: {e}"),
            DecodeError::Version(v) => write!(f, "unsupported version {v}"),
            DecodeError::UnknownType(_) => write!(f, "unknown message type"),
        }
    }
}

impl std::error::Error for DecodeError {}

impl Control {
    /// The message as a JSON text frame, with `v: 1`.
    pub fn to_json(&self) -> String {
        serde_json::to_string(&Envelope {
            v: VERSION,
            msg: self,
        })
        .expect("control messages always serialise")
    }

    /// Reads a JSON text frame, refusing any `v` other than 1.
    pub fn from_json(text: &str) -> Result<Control, DecodeError> {
        #[derive(Deserialize)]
        struct Head {
            v: u64,
            t: Option<String>,
        }
        let head: Head = serde_json::from_str(text).map_err(DecodeError::Malformed)?;
        if head.v != u64::from(VERSION) {
            return Err(DecodeError::Version(head.v));
        }
        if let Some(t) = head.t {
            if !KNOWN_TYPES.contains(&t.as_str()) {
                return Err(DecodeError::UnknownType(t));
            }
        }
        let env: Envelope<Control> = serde_json::from_str(text).map_err(DecodeError::Malformed)?;
        Ok(env.msg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_noise_pattern() {
        assert_eq!(NOISE_PATTERN, "Noise_IK_25519_ChaChaPoly_SHA256");
    }

    #[test]
    fn login_label_is_versioned() {
        assert_eq!(LOGIN_LABEL, "ade-remote/v1/login");
    }

    #[test]
    fn enc_is_label_then_length_prefixed_fields() {
        let out = enc("ade-remote/v1/x", &[b"ab", b"", &[0xff; 3]]);
        let mut want = b"ade-remote/v1/x".to_vec();
        want.extend_from_slice(&[0, 0, 0, 2, b'a', b'b']);
        want.extend_from_slice(&[0, 0, 0, 0]);
        want.extend_from_slice(&[0, 0, 0, 3, 0xff, 0xff, 0xff]);
        assert_eq!(out, want);
    }

    #[test]
    fn enc_keeps_field_boundaries_apart() {
        assert_ne!(enc("l", &[b"ab", b"c"]), enc("l", &[b"a", b"bc"]));
    }

    fn round_trip(msg: Control) {
        let text = msg.to_json();
        assert!(text.starts_with("{\"v\":1,"), "{text}");
        assert_eq!(Control::from_json(&text).unwrap(), msg);
    }

    #[test]
    fn challenge_round_trips_as_unpadded_base64url() {
        let msg = Control::Challenge {
            c: Bytes([0xfb; 32]),
        };
        let text = msg.to_json();
        assert_eq!(
            text,
            format!(
                "{{\"v\":1,\"t\":\"challenge\",\"c\":\"{}\"}}",
                "-_v7".repeat(10) + "-_s"
            )
        );
        assert!(!text.contains('='));
        round_trip(msg);
    }

    #[test]
    fn login_round_trips() {
        round_trip(Control::Login {
            id: Bytes([1; 32]),
            role: Role::Phone,
            sig: Bytes([2; 64]),
        });
        let text = Control::Login {
            id: Bytes([1; 32]),
            role: Role::Mac,
            sig: Bytes([2; 64]),
        }
        .to_json();
        assert!(text.contains("\"t\":\"login\""));
        assert!(text.contains("\"role\":\"mac\""));
    }

    #[test]
    fn welcome_round_trips() {
        round_trip(Control::Welcome {
            pairs: vec![PairInfo {
                pair_id: Bytes([3; 16]),
                peer_id: Bytes([4; 32]),
                peer_role: Role::Mac,
            }],
            online: vec![Bytes([4; 32])],
        });
    }

    #[test]
    fn presence_round_trips() {
        round_trip(Control::Presence {
            peer: Bytes([5; 32]),
            online: false,
        });
    }

    #[test]
    fn a_version_other_than_one_is_rejected() {
        let text = Control::Presence {
            peer: Bytes([5; 32]),
            online: true,
        }
        .to_json()
        .replace("\"v\":1", "\"v\":2");
        assert!(matches!(
            Control::from_json(&text),
            Err(DecodeError::Version(2))
        ));
        let missing = text.replace("\"v\":2,", "");
        assert!(matches!(
            Control::from_json(&missing),
            Err(DecodeError::Malformed(_))
        ));
    }

    #[test]
    fn an_unknown_type_is_told_apart_from_a_malformed_message() {
        let text = "{\"v\":1,\"t\":\"from_the_future\",\"x\":[1,2]}";
        match Control::from_json(text) {
            Err(DecodeError::UnknownType(t)) => assert_eq!(t, "from_the_future"),
            other => panic!("{other:?}"),
        }
        // A known type with bad fields is still malformed.
        let bad = "{\"v\":1,\"t\":\"presence\",\"peer\":\"AAAA\",\"online\":true}";
        assert!(matches!(
            Control::from_json(bad),
            Err(DecodeError::Malformed(_))
        ));
        // An unknown type under another version is a version error.
        let v2 = "{\"v\":2,\"t\":\"from_the_future\"}";
        assert!(matches!(
            Control::from_json(v2),
            Err(DecodeError::Version(2))
        ));
    }

    #[test]
    fn bytes_of_the_wrong_length_are_rejected() {
        let text = "{\"v\":1,\"t\":\"challenge\",\"c\":\"AAAA\"}";
        assert!(matches!(
            Control::from_json(text),
            Err(DecodeError::Malformed(_))
        ));
    }

    #[test]
    fn known_types_match_the_enum() {
        let all = [
            Control::Challenge { c: Bytes([0; 32]) },
            Control::Login {
                id: Bytes([0; 32]),
                role: Role::Mac,
                sig: Bytes([0; 64]),
            },
            Control::Welcome {
                pairs: vec![],
                online: vec![],
            },
            Control::Presence {
                peer: Bytes([0; 32]),
                online: true,
            },
        ];
        for (msg, t) in all.iter().zip(KNOWN_TYPES) {
            assert!(msg.to_json().contains(&format!("\"t\":\"{t}\"")), "{t}");
        }
    }

    #[test]
    fn role_names_match_the_wire() {
        assert_eq!(Role::Mac.as_str(), "mac");
        assert_eq!(Role::Phone.as_str(), "phone");
    }
}
