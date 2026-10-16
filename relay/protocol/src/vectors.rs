//! The shared protocol vectors in `packages/protocol/vectors/`, which the
//! TypeScript suite reads too. The crypto files come from `generate.mjs` (on
//! `node:crypto`); `names.json` and `qr.json` are written by hand from the spec.

use crate::seal::seal_with_nonce;
use crate::*;
use ed25519_dalek::SigningKey;
use serde_json::Value;

macro_rules! vector {
    ($file:literal) => {
        include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../packages/protocol/vectors/",
            $file
        ))
    };
}

fn load(text: &str) -> Value {
    serde_json::from_str(text).expect("vector file is JSON")
}

fn bytes(v: &Value) -> Vec<u8> {
    hex::decode(v.as_str().expect("hex string")).expect("valid hex")
}

fn arr<const N: usize>(v: &Value) -> [u8; N] {
    bytes(v).try_into().expect("right length")
}

fn text(v: &Value) -> &str {
    v.as_str().expect("string")
}

fn fields(v: &Value) -> Vec<Vec<u8>> {
    v.as_array().expect("array").iter().map(bytes).collect()
}

fn refs(fields: &[Vec<u8>]) -> Vec<&[u8]> {
    fields.iter().map(Vec::as_slice).collect()
}

fn list<'a>(file: &'a Value, key: &str) -> &'a Vec<Value> {
    file[key].as_array().expect(key)
}

#[test]
fn vectors_enc() {
    let file = load(vector!("enc.json"));
    let cases = list(&file, "cases");
    assert!(cases.len() >= 4);
    for case in cases {
        let f = fields(&case["fields"]);
        assert_eq!(
            enc(text(&case["label"]), &refs(&f)),
            bytes(&case["out"]),
            "{case}"
        );
    }
    for case in list(&file, "dec") {
        let input = bytes(&case["bytes"]);
        let got = dec(text(&case["label"]), &input).expect("decodes");
        assert_eq!(got, refs(&fields(&case["fields"])), "{case}");
    }
    for case in list(&file, "dec_refused") {
        let input = bytes(&case["bytes"]);
        assert_eq!(dec(text(&case["label"]), &input), None, "{case}");
    }
}

#[test]
fn vectors_story_2_enc_case_is_included() {
    let file = load(vector!("enc.json"));
    let first = &list(&file, "cases")[0];
    assert_eq!(text(&first["label"]), "ade-remote/v1/x");
    let mut want = b"ade-remote/v1/x".to_vec();
    want.extend_from_slice(&[
        0, 0, 0, 2, b'a', b'b', 0, 0, 0, 0, 0, 0, 0, 3, 0xff, 0xff, 0xff,
    ]);
    assert_eq!(bytes(&first["out"]), want);
}

#[test]
fn vectors_labels() {
    let file = load(vector!("labels.json"));
    let labels = list(&file, "labels");
    let values: Vec<&str> = labels.iter().map(|l| text(&l["value"])).collect();
    assert_eq!(values, ALL_LABELS);
    let ours = [
        ("LOGIN_LABEL", LOGIN_LABEL),
        ("NOISE_LABEL", NOISE_LABEL),
        ("PAIR_PHONE_TO_MAC_INFO", PAIR_PHONE_TO_MAC_INFO),
        ("PAIR_MAC_TO_PHONE_INFO", PAIR_MAC_TO_PHONE_INFO),
        ("PAIR_COMMIT_LABEL", PAIR_COMMIT_LABEL),
        ("PAIR_COMMIT_HASH_LABEL", PAIR_COMMIT_HASH_LABEL),
        ("PAIR_NONCE_LABEL", PAIR_NONCE_LABEL),
        ("PAIR_REVEAL_LABEL", PAIR_REVEAL_LABEL),
        ("PAIR_PHONE_SIG_LABEL", PAIR_PHONE_SIG_LABEL),
        ("PAIR_SAS_LABEL", PAIR_SAS_LABEL),
        ("PAIR_RECORD_LABEL", PAIR_RECORD_LABEL),
    ];
    assert_eq!(labels.len(), ours.len());
    for (label, (constant, value)) in labels.iter().zip(ours) {
        assert_eq!(text(&label["constant"]), constant);
        assert_eq!(text(&label["value"]), value);
        let use_ = text(&label["use"]);
        let info = constant.ends_with("_INFO");
        assert_eq!(use_, if info { "hkdf_info" } else { "enc" }, "{constant}");
    }
}

#[test]
fn vectors_signatures() {
    let file = load(vector!("signatures.json"));
    let anchor = &file["anchors"]["rfc8032_test1"];
    let key = SigningKey::from_bytes(&arr(&anchor["seed"]));
    assert_eq!(
        key.verifying_key().to_bytes().to_vec(),
        bytes(&anchor["public"])
    );
    // enc("", no fields) is the empty message, so sign() reproduces RFC 8032 test 1.
    assert_eq!(text(&anchor["message"]), "");
    let anchor_sig = sign(&key, "", &[]);
    assert_eq!(anchor_sig, arr::<64>(&anchor["sig"]));
    assert!(verify(&arr(&anchor["public"]), "", &[], &anchor_sig));

    let cases = list(&file, "cases");
    assert_eq!(cases.len(), ALL_LABELS.len());
    for case in cases {
        let key = SigningKey::from_bytes(&arr(&case["seed"]));
        assert_eq!(key.verifying_key().to_bytes(), arr::<32>(&case["public"]));
        let f = fields(&case["fields"]);
        let label = text(&case["label"]);
        assert_eq!(enc(label, &refs(&f)), bytes(&case["message"]));
        let sig = sign(&key, label, &refs(&f));
        assert_eq!(sig, arr::<64>(&case["sig"]), "{label}");
        assert!(verify(&arr(&case["public"]), label, &refs(&f), &sig));
    }

    let refused = list(&file, "refused");
    assert_eq!(refused.len(), 4);
    for case in refused {
        let f = fields(&case["fields"]);
        let ok = verify(
            &arr(&case["public"]),
            text(&case["label"]),
            &refs(&f),
            &arr(&case["sig"]),
        );
        assert!(!ok, "{}", case["why"]);
    }
}

#[test]
fn vectors_seals() {
    let file = load(vector!("seals.json"));
    for k in list(&file, "keys") {
        let keys = pair_keys(&arr(&k["s"]), &arr(&k["slot"]));
        assert_eq!(keys.pm, arr::<32>(&k["pm"]));
        assert_eq!(keys.mp, arr::<32>(&k["mp"]));
    }
    let cases = list(&file, "cases");
    assert_eq!(cases.len(), 3);
    for case in cases {
        let key = arr::<32>(&case["key"]);
        let label = text(&case["label"]);
        let f = fields(&case["fields"]);
        let sealed = seal_with_nonce(&key, &arr(&case["nonce"]), label, &refs(&f));
        assert_eq!(sealed, bytes(&case["sealed"]), "{label}");
        assert_eq!(open(&key, &sealed, label, f.len()), Some(f.clone()));
        assert_eq!(open(&key, &sealed, label, f.len() + 1), None);
    }
}

#[test]
fn vectors_seal_anchor_xchacha() {
    // The A.3.1 vector has AAD, which seals don't use; it pins the cipher itself.
    use chacha20poly1305::aead::{Aead, KeyInit, Payload};
    use chacha20poly1305::XChaCha20Poly1305;
    let file = load(vector!("seals.json"));
    let a = &file["anchors"]["xchacha_aead_a_3_1"];
    let cipher = XChaCha20Poly1305::new(bytes(&a["key"]).as_slice().into());
    let out = cipher
        .encrypt(
            bytes(&a["nonce"]).as_slice().into(),
            Payload {
                msg: &bytes(&a["plaintext"]),
                aad: &bytes(&a["aad"]),
            },
        )
        .unwrap();
    let mut want = bytes(&a["ciphertext"]);
    want.extend(bytes(&a["tag"]));
    assert_eq!(out, want);

    let h = &file["anchors"]["rfc5869_case1"];
    let mut okm = vec![0u8; h["length"].as_u64().unwrap() as usize];
    hkdf::Hkdf::<sha2::Sha256>::new(Some(&bytes(&h["salt"])), &bytes(&h["ikm"]))
        .expand(&bytes(&h["info"]), &mut okm)
        .unwrap();
    assert_eq!(okm, bytes(&h["okm"]));
}

fn sas_inputs(case: &Value) -> SasInputs {
    SasInputs {
        slot: arr(&case["slot"]),
        i_m: arr(&case["i_m"]),
        s_m: arr(&case["s_m"]),
        i_p: arr(&case["i_p"]),
        s_p: arr(&case["s_p"]),
        n_m: arr(&case["n_m"]),
        n_p: arr(&case["n_p"]),
        s: arr(&case["s"]),
    }
}

#[test]
fn vectors_sas() {
    let file = load(vector!("sas.json"));
    let cases = list(&file, "cases");
    assert_eq!(cases.len(), 3);
    let codes: Vec<String> = cases
        .iter()
        .map(|case| {
            let code = sas_code(&sas_inputs(case));
            assert_eq!(code, text(&case["code"]), "{}", case["why"]);
            code
        })
        .collect();
    assert!(
        codes[0].starts_with('0'),
        "the first code keeps its leading zero"
    );
    // The second case differs from the first only in I_P, the third only in S_P.
    let (a, b, c) = (
        sas_inputs(&cases[0]),
        sas_inputs(&cases[1]),
        sas_inputs(&cases[2]),
    );
    assert_ne!(a.i_p, b.i_p);
    assert_eq!(SasInputs { i_p: a.i_p, ..b }, a, "only I_P differs");
    assert_ne!(a.s_p, c.s_p);
    assert_eq!(SasInputs { s_p: a.s_p, ..c }, a, "only S_P differs");
    assert_ne!(codes[0], codes[1]);
    assert_ne!(codes[0], codes[2]);
}

#[test]
fn vectors_names() {
    let file = load(vector!("names.json"));
    for case in list(&file, "strings") {
        assert_eq!(
            clean_name(text(&case["input"])),
            text(&case["output"]),
            "{}",
            case["why"]
        );
    }
    for case in list(&file, "bytes") {
        assert_eq!(
            name_from_bytes(&bytes(&case["input"])),
            text(&case["output"]),
            "{}",
            case["why"]
        );
    }
    for case in list(&file, "lossy") {
        let input = bytes(&case["input"]);
        assert_eq!(
            String::from_utf8_lossy(&input),
            text(&case["output"]),
            "{case}"
        );
    }
}

fn error_name(e: PairCodeError) -> &'static str {
    e.as_str()
}

#[test]
fn vectors_qr_parse() {
    let file = load(vector!("qr.json"));
    for case in list(&file, "parse") {
        let why = &case["why"];
        let got = parse_pair_code(text(&case["code"]));
        if let Some(want) = case.get("ok") {
            let code = got.unwrap_or_else(|e| panic!("{why}: {e:?}"));
            assert_eq!(code.relay, text(&want["relay"]), "{why}");
            assert_eq!(code.slot, arr::<16>(&want["slot"]), "{why}");
            assert_eq!(code.id, arr::<32>(&want["id"]), "{why}");
            assert_eq!(code.x, arr::<32>(&want["x"]), "{why}");
            assert_eq!(code.s, arr::<32>(&want["s"]), "{why}");
            assert_eq!(code.name.as_deref(), want["name"].as_str(), "{why}");
        } else {
            let e = got.err().unwrap_or_else(|| panic!("{why}: parsed"));
            assert_eq!(error_name(e), text(&case["error"]), "{why}");
        }
    }
}

#[test]
fn vectors_qr_insecure_relays() {
    let file = load(vector!("qr.json"));
    let insecure: Vec<_> = list(&file, "parse")
        .iter()
        .filter(|c| c["error"] == "insecure_relay")
        .collect();
    assert!(insecure.len() >= 5);
    for case in insecure {
        assert_eq!(
            parse_pair_code(text(&case["code"])).err(),
            Some(PairCodeError::InsecureRelay),
            "{}",
            case["why"]
        );
    }
}

#[test]
fn vectors_qr_build() {
    let file = load(vector!("qr.json"));
    for case in list(&file, "build") {
        let why = &case["why"];
        let code = build_pair_code(
            text(&case["relay"]),
            &arr(&case["slot"]),
            &arr(&case["id"]),
            &arr(&case["x"]),
            &arr(&case["s"]),
            text(&case["name"]),
        )
        .unwrap_or_else(|e| panic!("{why}: {e:?}"));
        assert_eq!(code, text(&case["code"]), "{why}");
        let parsed = parse_pair_code(&code).unwrap();
        assert_eq!(
            parsed.name.as_deref(),
            case["parsed_name"].as_str(),
            "{why}"
        );
        assert_eq!(parsed.relay, text(&case["relay"]));
        assert_eq!(parsed.slot, arr::<16>(&case["slot"]));
        assert_eq!(parsed.id, arr::<32>(&case["id"]));
        assert_eq!(parsed.x, arr::<32>(&case["x"]));
        assert_eq!(parsed.s, arr::<32>(&case["s"]));
    }
    for case in list(&file, "build_refused") {
        let got = build_pair_code(
            text(&case["relay"]),
            &arr(&case["slot"]),
            &arr(&case["id"]),
            &arr(&case["x"]),
            &arr(&case["s"]),
            text(&case["name"]),
        );
        assert_eq!(
            got.err().map(error_name),
            Some(text(&case["error"])),
            "{}",
            case["why"]
        );
    }
}

/// AC2: a signature and a seal made under each label fail under every other.
#[test]
fn vectors_cross_label_signatures_and_seals_fail() {
    let key = SigningKey::from_bytes(&[7; 32]);
    let id = key.verifying_key().to_bytes();
    let seal_key = [9u8; 32];
    let f: [&[u8]; 2] = [b"field one", &[0u8; 32]];
    let mut checked = (0, 0);
    for made in ALL_LABELS {
        let sig = sign(&key, made, &f);
        let sealed = seal(&seal_key, made, &f);
        assert!(verify(&id, made, &f, &sig), "{made}");
        assert!(open(&seal_key, &sealed, made, 2).is_some(), "{made}");
        for other in ALL_LABELS.iter().filter(|l| **l != made) {
            assert!(!verify(&id, other, &f, &sig), "{made} under {other}");
            assert!(
                open(&seal_key, &sealed, other, 2).is_none(),
                "{made} under {other}"
            );
            checked.0 += 1;
            checked.1 += 1;
        }
    }
    assert_eq!(checked, (110, 110));
}
