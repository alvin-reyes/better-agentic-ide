# Phone remote: package and crate names

Set by the scaffold story (piece 2a, story 1). Layout follows the spec's "Code layout"
(`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`).

## Rust: `relay/` (virtual workspace, its own `Cargo.lock`, not a member of `src-tauri`)

| Directory        | Package          | Import as        | Kind |
|------------------|------------------|------------------|------|
| `relay/protocol` | `relay-protocol` | `relay_protocol` | lib  |
| `relay/core`     | `relay-core`     | `relay_core`     | lib (not `core`: that is Rust's built-in crate) |
| `relay/server`   | `relay-server`   | binary `relay-server` | bin |
| `relay/cli`      | `relay-cli`      | binary `relay-cli`    | bin |
| `relay/e2e`      | `relay-e2e`      | tests in `relay/e2e/tests/` | test holder |

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
