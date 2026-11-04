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
    /// Relay → device (story 7b): a frame over the frame limit was dropped. `peer` is
    /// the frame's recipient.
    RateLimited { peer: DeviceKey, retry_ms: u64 },
    /// Relay → device (story 7b): a control message over the control limit was dropped
    /// unprocessed. `msg` is its type; `slot`, `pair_id` and `peer` are given when it
    /// carried them (a malformed one counts as absent), and left out of the JSON when
    /// not. A device re-sends it after `retry_ms`, except `push` and `rehandshake`.
    ControlLimited {
        msg: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        slot: Option<Bytes<16>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pair_id: Option<PairId>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        peer: Option<DeviceKey>,
        retry_ms: u64,
    },
    /// Mac → relay → phone (story 7b, ADR 0005): ask for a new handshake. `peer` is the
    /// recipient when sent, and the sender when the relay delivers it.
    Rehandshake { peer: DeviceKey },
}

/// Every `t` in `Control`, so an unknown one can be told apart from a malformed one.
const KNOWN_TYPES: [&str; 7] = [
    "challenge",
    "login",
    "welcome",
    "presence",
    "rate_limited",
    "control_limited",
    "rehandshake",
];

/// What the relay reads of a control message before it acts on it (story 7b): `t`, and
/// at best effort the `slot`, `pair_id` and `peer` it carries. A field that is missing
/// or malformed is `None`; only a message that isn't a JSON object with `v: 1` and a
/// string `t` can't be read at all.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ControlHead {
    pub t: String,
    pub slot: Option<Bytes<16>>,
    pub pair_id: Option<PairId>,
    pub peer: Option<DeviceKey>,
}

impl ControlHead {
    /// Reads the head of a text frame, or `None` if it is unreadable.
    pub fn read(text: &str) -> Option<ControlHead> {
        let value: serde_json::Value = serde_json::from_str(text).ok()?;
        let obj = value.as_object()?;
        if obj.get("v")?.as_u64()? != u64::from(VERSION) {
            return None;
        }
        let t = obj.get("t")?.as_str()?.to_string();
        fn field<const N: usize>(
            obj: &serde_json::Map<String, serde_json::Value>,
            name: &str,
        ) -> Option<Bytes<N>> {
            serde_json::from_value(obj.get(name)?.clone()).ok()
        }
        Some(ControlHead {
            t,
            slot: field(obj, "slot"),
            pair_id: field(obj, "pair_id"),
            peer: field(obj, "peer"),
        })
    }
}

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
            Control::RateLimited {
                peer: Bytes([0; 32]),
                retry_ms: 0,
            },
            Control::ControlLimited {
                msg: String::new(),
                slot: None,
                pair_id: None,
                peer: None,
                retry_ms: 0,
            },
            Control::Rehandshake {
                peer: Bytes([0; 32]),
            },
        ];
        assert_eq!(all.len(), KNOWN_TYPES.len());
        for (msg, t) in all.iter().zip(KNOWN_TYPES) {
            assert!(msg.to_json().contains(&format!("\"t\":\"{t}\"")), "{t}");
        }
    }

    #[test]
    fn rate_limited_round_trips() {
        let msg = Control::RateLimited {
            peer: Bytes([6; 32]),
            retry_ms: 50,
        };
        assert!(msg.to_json().contains("\"t\":\"rate_limited\""));
        assert!(msg.to_json().contains("\"retry_ms\":50"));
        round_trip(msg);
    }

    #[test]
    fn control_limited_leaves_out_absent_options() {
        let bare = Control::ControlLimited {
            msg: "pair_status".into(),
            slot: None,
            pair_id: None,
            peer: None,
            retry_ms: 100,
        };
        assert_eq!(
            bare.to_json(),
            "{\"v\":1,\"t\":\"control_limited\",\"msg\":\"pair_status\",\"retry_ms\":100}"
        );
        round_trip(bare);
        let full = Control::ControlLimited {
            msg: "rehandshake".into(),
            slot: Some(Bytes([1; 16])),
            pair_id: Some(Bytes([2; 16])),
            peer: Some(Bytes([3; 32])),
            retry_ms: 7,
        };
        let text = full.to_json();
        for field in ["\"slot\"", "\"pair_id\"", "\"peer\""] {
            assert!(text.contains(field), "{text}");
        }
        round_trip(full);
    }

    #[test]
    fn rehandshake_round_trips_with_its_peer() {
        let msg = Control::Rehandshake {
            peer: Bytes([8; 32]),
        };
        assert_eq!(
            msg.to_json(),
            format!(
                "{{\"v\":1,\"t\":\"rehandshake\",\"peer\":\"{}\"}}",
                URL_SAFE_NO_PAD.encode([8u8; 32])
            )
        );
        round_trip(msg);
    }

    fn b64(bytes: &[u8]) -> String {
        URL_SAFE_NO_PAD.encode(bytes)
    }

    #[test]
    fn a_control_head_reads_t_and_the_fields_it_carries() {
        let text = format!(
            "{{\"v\":1,\"t\":\"pair_status\",\"slot\":\"{}\",\"pair_id\":\"{}\",\"peer\":\"{}\",\"x\":[1]}}",
            b64(&[1; 16]),
            b64(&[2; 16]),
            b64(&[3; 32])
        );
        assert_eq!(
            ControlHead::read(&text),
            Some(ControlHead {
                t: "pair_status".into(),
                slot: Some(Bytes([1; 16])),
                pair_id: Some(Bytes([2; 16])),
                peer: Some(Bytes([3; 32])),
            })
        );
        // An unknown type reads too: the head doesn't judge `t`.
        let head = ControlHead::read("{\"v\":1,\"t\":\"from_the_future\"}").unwrap();
        assert_eq!(head.t, "from_the_future");
        assert_eq!((head.slot, head.pair_id, head.peer), (None, None, None));
    }

    #[test]
    fn a_malformed_slot_or_pair_id_counts_as_absent() {
        for bad in [
            "\"AAAA\"".to_string(),
            "1".into(),
            "null".into(),
            format!("\"{}=\"", b64(&[1; 16])),
            format!("\"{}\"", b64(&[1; 17])),
            "{}".into(),
        ] {
            let text = format!("{{\"v\":1,\"t\":\"unpair\",\"slot\":{bad},\"pair_id\":{bad}}}");
            let head = ControlHead::read(&text).unwrap_or_else(|| panic!("{text}"));
            assert_eq!(head.t, "unpair");
            assert_eq!((head.slot, head.pair_id), (None, None), "{text}");
        }
    }

    #[test]
    fn a_rehandshake_with_a_malformed_peer_reads_with_no_peer() {
        for bad in [
            "\"AAAA\"".to_string(),
            "7".into(),
            format!("\"{}\"", b64(&[3; 16])),
        ] {
            let text = format!("{{\"v\":1,\"t\":\"rehandshake\",\"peer\":{bad}}}");
            let head = ControlHead::read(&text).unwrap();
            assert_eq!(
                (head.t.as_str(), head.peer),
                ("rehandshake", None),
                "{text}"
            );
        }
        let missing = ControlHead::read("{\"v\":1,\"t\":\"rehandshake\"}").unwrap();
        assert_eq!(missing.peer, None);
    }

    #[test]
    fn an_unreadable_head_is_none() {
        for text in [
            "",
            "not json",
            "[1,2]",
            "\"rehandshake\"",
            "{\"t\":\"pair_status\"}",
            "{\"v\":2,\"t\":\"pair_status\"}",
            "{\"v\":\"1\",\"t\":\"pair_status\"}",
            "{\"v\":1}",
            "{\"v\":1,\"t\":7}",
        ] {
            assert_eq!(ControlHead::read(text), None, "{text:?}");
        }
    }

    #[test]
    fn role_names_match_the_wire() {
        assert_eq!(Role::Mac.as_str(), "mac");
        assert_eq!(Role::Phone.as_str(), "phone");
    }
}
