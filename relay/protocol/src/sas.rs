//! The 6-digit code both sides show (pairing step 7).

use crate::enc::enc;
use crate::labels::PAIR_SAS_LABEL;
use sha2::{Digest, Sha256};

/// Everything the code is computed over, in `enc` order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SasInputs {
    pub slot: [u8; 16],
    pub i_m: [u8; 32],
    pub s_m: [u8; 32],
    pub i_p: [u8; 32],
    pub s_p: [u8; 32],
    pub n_m: [u8; 32],
    pub n_p: [u8; 32],
    pub s: [u8; 32],
}

/// `SHA-256(enc(PAIR_SAS_LABEL, slot, I_M, S_M, I_P, S_P, N_M, N_P, s))`, its first
/// 8 bytes read as a big-endian u64, modulo 10^6, as 6 digits.
pub fn sas_code(inputs: &SasInputs) -> String {
    let i = inputs;
    let fields: [&[u8]; 8] = [
        &i.slot, &i.i_m, &i.s_m, &i.i_p, &i.s_p, &i.n_m, &i.n_p, &i.s,
    ];
    let digest = Sha256::digest(enc(PAIR_SAS_LABEL, &fields));
    let first: [u8; 8] = digest[..8].try_into().expect("SHA-256 is 32 bytes");
    format!("{:06}", u64::from_be_bytes(first) % 1_000_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_code_is_six_digits() {
        let code = sas_code(&SasInputs {
            slot: [0; 16],
            i_m: [1; 32],
            s_m: [2; 32],
            i_p: [3; 32],
            s_p: [4; 32],
            n_m: [5; 32],
            n_p: [6; 32],
            s: [7; 32],
        });
        assert_eq!(code.len(), 6);
        assert!(code.bytes().all(|b| b.is_ascii_digit()));
    }
}
