//! The binary envelope for session traffic, shared by the devices and the relay:
//! `u8 type (1 hs1, 2 hs2, 3 frame) || 32-byte peer identity key || body`. The peer
//! is the recipient when a device sends, and the sender when the relay delivers.

use crate::{Bytes, DeviceKey};

/// The envelope's type byte.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum RoutedKind {
    Hs1 = 1,
    Hs2 = 2,
    Frame = 3,
}

/// One binary WebSocket message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Routed {
    pub kind: RoutedKind,
    pub peer: DeviceKey,
    pub body: Vec<u8>,
}

impl Routed {
    /// The type byte and the peer key.
    pub const HEADER_LEN: usize = 33;

    /// Reads an envelope: `None` under 33 bytes or for a type other than 1, 2, 3.
    pub fn parse(bytes: &[u8]) -> Option<Routed> {
        if bytes.len() < Self::HEADER_LEN {
            return None;
        }
        let kind = match bytes[0] {
            1 => RoutedKind::Hs1,
            2 => RoutedKind::Hs2,
            3 => RoutedKind::Frame,
            _ => return None,
        };
        let peer = Bytes(bytes[1..Self::HEADER_LEN].try_into().expect("32 bytes"));
        Some(Routed {
            kind,
            peer,
            body: bytes[Self::HEADER_LEN..].to_vec(),
        })
    }

    /// The envelope's bytes.
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(Self::HEADER_LEN + self.body.len());
        out.push(self.kind as u8);
        out.extend_from_slice(&self.peer.0);
        out.extend_from_slice(&self.body);
        out
    }

    /// The same envelope naming another peer: the relay swaps the recipient for the
    /// sender before delivering.
    pub fn with_peer(self, peer: DeviceKey) -> Routed {
        Routed { peer, ..self }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_envelope_round_trips() {
        let r = Routed {
            kind: RoutedKind::Hs2,
            peer: Bytes([7; 32]),
            body: vec![1, 2, 3],
        };
        let bytes = r.encode();
        assert_eq!(bytes[0], 2);
        assert_eq!(bytes.len(), 36);
        assert_eq!(Routed::parse(&bytes), Some(r.clone()));
        let swapped = r.with_peer(Bytes([9; 32]));
        assert_eq!(swapped.peer, Bytes([9; 32]));
        assert_eq!(swapped.body, vec![1, 2, 3]);
    }

    #[test]
    fn an_empty_body_parses() {
        let mut bytes = vec![3];
        bytes.extend_from_slice(&[0; 32]);
        assert_eq!(Routed::parse(&bytes).unwrap().body, Vec::<u8>::new());
    }

    #[test]
    fn short_or_unknown_envelopes_are_refused() {
        for n in 0..33 {
            assert_eq!(Routed::parse(&vec![1; n]), None, "{n}");
        }
        for t in [0u8, 4, 255] {
            let mut bytes = vec![t];
            bytes.extend_from_slice(&[0; 40]);
            assert_eq!(Routed::parse(&bytes), None, "{t}");
        }
    }
}
