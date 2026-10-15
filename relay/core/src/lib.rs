//! The pairing and session state machines and the snapshot builder, free of Tauri.

/// The Noise pattern, as `relay-protocol` names it.
pub fn noise_pattern() -> &'static str {
    relay_protocol::NOISE_PATTERN
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reaches_protocol_by_path() {
        assert_eq!(noise_pattern(), relay_protocol::NOISE_PATTERN);
    }
}
