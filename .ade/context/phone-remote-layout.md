# Phone remote: package and crate names

Set by the scaffold story (piece 2a, story 1). Layout follows the spec's "Code layout"
(`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`).

## Rust: `relay/` (virtual workspace, its own `Cargo.lock`, not a member of `src-tauri`)

| Directory        | Package          | Import as        | Kind |
|------------------|------------------|------------------|------|
| `relay/protocol` | `relay-protocol` | `relay_protocol` | lib  |
| `relay/core`     | `relay-core`     | `relay_core`     | lib (not `core`: that is Rust's built-in crate) |
| `relay/server`   | `relay-server`   | `relay_server`; binary `relay-server` | lib + bin |
| `relay/cli`      | `relay-cli`      | `relay_cli`; binary `relay-cli`    | lib + bin |
| `relay/e2e`      | `relay-e2e`      | tests in `relay/e2e/tests/` | test holder |

Server and CLI became lib plus thin bin in story 2, so the e2e test drives them in-process.
The wire contract is in `remote-protocol.md`.

`src-tauri` should depend on `relay-protocol` and `relay-core` by path once stories 5a and 8 land.

## TypeScript

- `packages/protocol` is `@ade/protocol` (private). `main` and `types` point at `src/index.ts`, so
  it's consumed as TypeScript source, never built.
- `@noble/curves` ^1.9.7, `@noble/ciphers` ^1.3.0 and `@noble/hashes` ^1.8.0 are its peer
  dependencies, installed in the root (devDependencies) and in `mobile/`.
- `mobile/` gets it as `file:../packages/protocol`. Metro (`nodeModulesPaths`), Jest
  (`moduleDirectories`) and the app's tsc (`preserveSymlinks`) all resolve its imports from
  `mobile/node_modules`.
- Exports so far: `NOISE_PATTERN` (`"Noise_IK_25519_ChaChaPoly_SHA256"`, the same string as
  `relay_protocol::NOISE_PATTERN`), and `suite` (`dh` = x25519, `cipher` = chacha20poly1305,
  `hash` = sha256).
- Story 3 added, one module each, re-exported from `src/index.ts`:
  - `bytes.ts`: `toHex`, `fromHex`, `concatBytes`, `base64UrlEncode`, `base64UrlDecode`
    (strict, `null` on bad input), `utf8Encode`, `utf8DecodeLossy`, `percentEncode`,
    `percentDecode` (strict, `null` on bad input), `randomBytes`;
  - `enc.ts`: `enc`, `dec`;
  - `labels.ts`: the eleven label constants and `ALL_LABELS`;
  - `sign.ts`: `sign(seed, label, fields)`, `verify(id, label, fields, sig)`;
  - `seal.ts`: `pairKeys`, `sealWithNonce`, `seal`, `open`, `NONCE_LEN`, `TAG_LEN`, type `PairKeys`;
  - `sas.ts`: `sasCode`, type `SasInputs`;
  - `names.ts`: `cleanName`, `nameFromBytes`;
  - `qr.ts`: `buildPairCode`, `parsePairCode`, types `PairCode`, `PairCodeInput`,
    `PairCodeError`, `PairCodeResult`.

  The Rust twins are at the `relay_protocol` crate root: `enc`, `dec`, the label constants,
  `ALL_LABELS`, `sign`, `verify`, `pair_keys`, `PairKeys`, `seal_with_nonce`, `seal`, `open`,
  `NONCE_LEN`, `TAG_LEN`, `sas_code`, `SasInputs`, `clean_name`, `name_from_bytes`,
  `build_pair_code`, `parse_pair_code`, `PairCode`, `PairCodeError`.
- **Import rule:** the package's non-test `src/` modules take randomness only from
  `globalThis.crypto.getRandomValues` and import nothing but the `@noble` peers (and each
  other). Tests and `vectors/generate.mjs` may use `node:` modules.
- `relay-protocol` depends on `ed25519-dalek`, `rand`, `hkdf 0.12.4`, `chacha20poly1305 0.10.1`
  and `sha2 0.10.9` (the RustCrypto 0.10 line, so `sha2` isn't duplicated), and `hex 0.4.3` for
  tests.
