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

// --- Noise IK (story 4) ---------------------------------------------------------

use crate::noise::{handshake_raw, read_hs1_with, RawRole};
use sha2::{Digest, Sha256};

#[test]
fn vectors_cacophony_ik() {
    let file = load(vector!("cacophony-ik.json"));
    let v = &file["vector"];
    assert_eq!(text(&v["protocol_name"]), NOISE_PATTERN);
    let prologue = bytes(&v["init_prologue"]);
    assert_eq!(prologue, bytes(&v["resp_prologue"]));
    let msgs = list(v, "messages");
    assert_eq!(msgs.len(), 6);

    let mut init = handshake_raw(
        RawRole::Initiator {
            remote_static: arr(&v["init_remote_static"]),
        },
        &prologue,
        &arr(&v["init_static"]),
        Some(arr(&v["init_ephemeral"])),
    );
    let mut resp = handshake_raw(
        RawRole::Responder,
        &prologue,
        &arr(&v["resp_static"]),
        Some(arr(&v["resp_ephemeral"])),
    );

    // hs1 and hs2, each written by one side and read by the other.
    let hs1 = init.write(&bytes(&msgs[0]["payload"]));
    assert_eq!(hs1, bytes(&msgs[0]["ciphertext"]));
    assert_eq!(hs1.len(), 112);
    assert_eq!(resp.read(&hs1).unwrap(), bytes(&msgs[0]["payload"]));
    let hs2 = resp.write(&bytes(&msgs[1]["payload"]));
    assert_eq!(hs2, bytes(&msgs[1]["ciphertext"]));
    assert_eq!(hs2.len(), 63);
    assert_eq!(init.read(&hs2).unwrap(), bytes(&msgs[1]["payload"]));
    assert_eq!(init.handshake_hash(), bytes(&v["handshake_hash"]));
    assert_eq!(resp.handshake_hash(), bytes(&v["handshake_hash"]));

    // Transport: initiator first, implicit nonces 0, 0, 1, 1.
    let init = init.into_transport();
    let resp = resp.into_transport();
    for (i, m) in msgs[2..].iter().enumerate() {
        let nonce = (i / 2) as u64;
        let (from, to) = if i % 2 == 0 {
            (&init, &resp)
        } else {
            (&resp, &init)
        };
        let ct = from.encrypt(nonce, &bytes(&m["payload"]));
        assert_eq!(ct, bytes(&m["ciphertext"]), "message {}", i + 2);
        assert_eq!(to.decrypt(nonce, &ct).unwrap(), bytes(&m["payload"]));
    }
}

/// Byte i is i % 251: every frame plaintext in noise.json.
fn plaintext_of(len: usize) -> Vec<u8> {
    (0..len).map(|i| (i % 251) as u8).collect()
}

fn u64_of(v: &Value) -> u64 {
    v.as_u64().expect("a u64")
}

struct NoiseFile {
    file: Value,
    mac: StaticKeypair,
    phone: StaticKeypair,
    i_m: DeviceKey,
    i_p: DeviceKey,
}

fn noise_file() -> NoiseFile {
    let file = load(vector!("noise.json"));
    let k = &file["keys"];
    let mac = StaticKeypair::from_secret(arr(&k["mac_static_secret"]));
    let phone = StaticKeypair::from_secret(arr(&k["phone_static_secret"]));
    assert_eq!(mac.public(), arr::<32>(&k["mac_static_public"]));
    assert_eq!(phone.public(), arr::<32>(&k["phone_static_public"]));
    let (i_m, i_p) = (Bytes(arr(&k["i_m"])), Bytes(arr(&k["i_p"])));
    NoiseFile {
        file,
        mac,
        phone,
        i_m,
        i_p,
    }
}

impl NoiseFile {
    /// The phone's initiator for handshakes[i], with its fixed ephemeral.
    fn initiator(&self, i: usize) -> (Initiator, Vec<u8>) {
        let h = &self.file["handshakes"][i];
        Initiator::start_with(
            &self.phone,
            &self.i_m,
            &self.i_p,
            &self.mac.public(),
            u64_of(&h["counter"]),
            Some(arr(&h["phone_ephemeral"])),
        )
        .expect("starts")
    }

    /// Both sessions of handshakes[i]: (phone, Mac).
    fn sessions(&self, i: usize) -> (Session, Session) {
        let h = &self.file["handshakes"][i];
        let (mut init, hs1) = self.initiator(i);
        let read = read_hs1_with(
            &self.mac,
            &self.i_m,
            &self.i_p,
            &hs1,
            Some(arr(&h["mac_ephemeral"])),
        )
        .expect("hs1 reads");
        let (hs2, mac) = read.reply();
        (init.finish(&hs2).expect("hs2 reads"), mac)
    }
}

#[test]
fn vectors_noise_handshakes() {
    let n = noise_file();
    assert_eq!(text(&n.file["pattern"]), NOISE_PATTERN);
    assert_eq!(noise_prologue(&n.i_m, &n.i_p), bytes(&n.file["prologue"]));
    let hss = list(&n.file, "handshakes");
    let counters: Vec<u64> = hss.iter().map(|h| u64_of(&h["counter"])).collect();
    assert_eq!(counters, vec![0, 1_760_000_000_000, MAX_COUNTER]);
    for (i, h) in hss.iter().enumerate() {
        let (mut init, hs1) = n.initiator(i);
        assert_eq!(hs1, bytes(&h["hs1"]), "hs1 {i}");
        assert_eq!(hs1.len(), HS1_LEN);
        assert_eq!(init.counter(), counters[i]);
        let read = read_hs1_with(&n.mac, &n.i_m, &n.i_p, &hs1, Some(arr(&h["mac_ephemeral"])))
            .expect("hs1 reads");
        assert_eq!(read.counter(), counters[i]);
        assert_eq!(read.remote_static(), n.phone.public());
        let (hs2, mac) = read.reply();
        assert_eq!(hs2, bytes(&h["hs2"]), "hs2 {i}");
        assert_eq!(hs2.len(), HS2_LEN);
        let phone = init.finish(&hs2).expect("hs2 reads");
        let id: [u8; SESSION_ID_LEN] = arr(&h["session_id"]);
        assert_eq!(id[..], bytes(&h["handshake_hash"])[..8]);
        assert_eq!(phone.id(), id);
        assert_eq!(mac.id(), id);
    }
}

#[test]
fn vectors_noise_frames() {
    let n = noise_file();
    let (mut phone, mut mac) = n.sessions(0);
    for f in list(&n.file, "frames") {
        let nonce = u64_of(&f["nonce"]);
        let plain = plaintext_of(u64_of(&f["plaintext_len"]) as usize);
        let (from, to) = match text(&f["direction"]) {
            "phone_to_mac" => (&mut phone, &mut mac),
            _ => (&mut mac, &mut phone),
        };
        from.preset(nonce, None);
        let body = from.seal(&plain).expect("seals");
        assert_eq!(from.send_nonce(), nonce + 1);
        assert_eq!(body.len() as u64, u64_of(&f["body_len"]));
        match f.get("body") {
            Some(want) => assert_eq!(body, bytes(want), "{f}"),
            None => assert_eq!(Sha256::digest(&body).to_vec(), bytes(&f["body_sha256"])),
        }
        to.preset(0, None);
        assert_eq!(to.open(&body), Opened::Accept(plain));
        assert_eq!(to.last_recv(), Some(nonce));
    }
}

#[test]
fn vectors_noise_envelopes() {
    let n = noise_file();
    let kinds = [RoutedKind::Hs1, RoutedKind::Hs2, RoutedKind::Frame];
    for (e, kind) in list(&n.file, "envelopes").iter().zip(kinds) {
        assert_eq!(u64_of(&e["kind"]), kind as u64);
        let routed = Routed {
            kind,
            peer: Bytes(arr(&e["peer"])),
            body: bytes(&e["body"]),
        };
        assert_eq!(routed.encode(), bytes(&e["bytes"]));
        assert_eq!(Routed::parse(&bytes(&e["bytes"])), Some(routed));
    }
}

#[test]
fn vectors_noise_sweep() {
    let n = noise_file();
    let sweep = list(&n.file, "sweep");
    assert_eq!(sweep.len(), 16);
    for c in sweep {
        let phone = StaticKeypair::from_secret(arr(&c["phone_secret"]));
        let mac = StaticKeypair::from_secret(arr(&c["mac_secret"]));
        let (i_m, i_p) = (Bytes(arr(&c["i_m"])), Bytes(arr(&c["i_p"])));
        let (mut init, hs1) = Initiator::start_with(
            &phone,
            &i_m,
            &i_p,
            &mac.public(),
            u64_of(&c["counter"]),
            Some(arr(&c["phone_ephemeral"])),
        )
        .unwrap();
        assert_eq!(hs1, bytes(&c["hs1"]));
        let read = read_hs1_with(&mac, &i_m, &i_p, &hs1, Some(arr(&c["mac_ephemeral"]))).unwrap();
        let (hs2, mut m) = read.reply();
        assert_eq!(hs2, bytes(&c["hs2"]));
        let mut p = init.finish(&hs2).unwrap();
        assert_eq!(p.id(), arr::<8>(&c["session_id"]));
        for f in list(c, "frames") {
            let nonce = u64_of(&f["nonce"]);
            let plain = plaintext_of(u64_of(&f["plaintext_len"]) as usize);
            let (from, to) = match text(&f["direction"]) {
                "phone_to_mac" => (&mut p, &mut m),
                _ => (&mut m, &mut p),
            };
            from.preset(nonce, None);
            let body = from.seal(&plain).unwrap();
            assert_eq!(body, bytes(&f["body"]));
            assert_eq!(to.open(&body), Opened::Accept(plain));
        }
    }
}

#[test]
fn vectors_noise_refused_hs1() {
    let n = noise_file();
    let cases = list(&n.file["refused"], "hs1");
    let low_order = list(&n.file, "low_order");
    assert_eq!(low_order.len(), 14);
    assert_eq!(cases.len(), 9 + 2 * low_order.len());
    for c in cases {
        assert_eq!(text(&c["layer"]), "crypto");
        let sender = Bytes(arr(&c["sender_i_p"]));
        let got = read_hs1(&n.mac, &n.i_m, &sender, &bytes(&c["hs1"]));
        assert!(got.is_err(), "{}", text(&c["why"]));
    }
}

#[test]
fn vectors_noise_refused_hs2_leave_the_handshake_usable() {
    let n = noise_file();
    let good = bytes(&n.file["handshakes"][0]["hs2"]);
    let id: [u8; 8] = arr(&n.file["handshakes"][0]["session_id"]);
    let cases = list(&n.file["refused"], "hs2");
    assert_eq!(cases.len(), 6 + 14);
    for c in cases {
        assert_eq!(text(&c["layer"]), "crypto");
        let (mut init, _) = n.initiator(0);
        assert!(
            init.finish(&bytes(&c["hs2"])).is_err(),
            "{}",
            text(&c["why"])
        );
        let session = init.finish(&good).expect("the right hs2 still completes");
        assert_eq!(session.id(), id, "{}", text(&c["why"]));
    }
}

#[test]
fn vectors_noise_low_order_keys_are_refused_by_the_rule() {
    let n = noise_file();
    for u in list(&n.file, "low_order") {
        let u: [u8; 32] = arr(&u["u"]);
        assert!(crate::noise::is_low_order(&n.mac, &u));
        assert!(crate::noise::is_low_order(&n.phone, &u));
        // A low-order Mac static is refused before anything is sent.
        let got = Initiator::start(&n.phone, &n.i_m, &n.i_p, &u, 0);
        assert!(matches!(got, Err(HandshakeError::LowOrder)));
    }
    assert!(!crate::noise::is_low_order(&n.phone, &n.mac.public()));
}

#[test]
fn vectors_noise_high_bit_e_completes() {
    let n = noise_file();
    let h0 = &n.file["handshakes"][0];
    let cases = list(&n.file, "high_bit_e");
    assert_eq!(cases.len(), 2);
    // hs1 with a top-bit e: the Mac reads it and replies as the vector says.
    let c = &cases[0];
    let read = read_hs1_with(
        &n.mac,
        &n.i_m,
        &n.i_p,
        &bytes(&c["hs1"]),
        Some(arr(&h0["mac_ephemeral"])),
    )
    .expect("a top-bit e is read");
    let (hs2, mac) = read.reply();
    assert_eq!(hs2, bytes(&c["hs2"]));
    assert_eq!(mac.id(), arr::<8>(&c["session_id"]));
    // hs2 with a top-bit e: the phone completes.
    let c = &cases[1];
    let (mut init, hs1) = n.initiator(0);
    assert_eq!(hs1, bytes(&c["hs1"]));
    let phone = init.finish(&bytes(&c["hs2"])).expect("a top-bit e is read");
    assert_eq!(phone.id(), arr::<8>(&c["session_id"]));
}

fn script_body(step: &Value) -> Vec<u8> {
    match step.get("body") {
        Some(b) => bytes(b),
        None => {
            let fill = &step["body_fill"];
            let mut out = bytes(&fill["prefix"]);
            out.resize(u64_of(&fill["len"]) as usize, 0);
            out
        }
    }
}

#[test]
fn vectors_noise_receiver_scripts() {
    let n = noise_file();
    let scripts = list(&n.file, "receiver_scripts");
    assert_eq!(scripts.len(), 2);
    for script in scripts {
        let (phone, mac) = n.sessions(0);
        let mut to = match text(&script["direction"]) {
            "phone_to_mac" => mac,
            _ => phone,
        };
        for step in list(script, "steps") {
            let why = text(&step["why"]);
            let got = to.open(&script_body(step));
            match text(&step["outcome"]) {
                "accept" => assert_eq!(
                    got,
                    Opened::Accept(plaintext_of(u64_of(&step["plaintext_len"]) as usize)),
                    "{why}"
                ),
                "drop" => assert_eq!(got, Opened::Drop, "{why}"),
                "bad" => assert_eq!(got, Opened::Bad, "{why}"),
                other => panic!("unknown outcome {other}"),
            }
            assert_eq!(to.last_recv(), step["last_recv"].as_u64(), "{why}");
        }
    }
}

#[test]
fn vectors_noise_ac6_nonces_0_2_2_1_5() {
    // AC6, read from the receiver scripts: nonces 0, 2, 2, 1, 5 give accept, accept,
    // drop, drop, accept.
    let n = noise_file();
    let steps = list(&n.file["receiver_scripts"][0], "steps");
    let outcomes: Vec<(u64, &str)> = steps
        .iter()
        .map(|s| (script_body(s), text(&s["outcome"])))
        .filter(|(b, _)| {
            b.len() >= 32 && b[..8] == bytes(&n.file["handshakes"][0]["session_id"])[..]
        })
        .map(|(b, o)| (u64::from_be_bytes(b[8..16].try_into().unwrap()), o))
        .collect();
    let window: Vec<_> = outcomes
        .iter()
        .skip_while(|(nonce, o)| !(*nonce == 0 && *o == "accept"))
        .take(5)
        .copied()
        .collect();
    assert_eq!(
        window,
        vec![
            (0, "accept"),
            (2, "accept"),
            (2, "drop"),
            (1, "drop"),
            (5, "accept")
        ]
    );
}
