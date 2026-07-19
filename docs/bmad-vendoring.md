# Vendoring BMAD assets

ADE bundles a pinned copy of BMAD-METHOD under `src-tauri/resources/bmad/`.

- Pinned version: see `src-tauri/resources/bmad/VERSION`.
- To upgrade: re-run the clone+copy in Task 2 of the implementation plan
  with a new tag, update `VERSION`, and re-test scaffolding idempotency.
- Runtime never fetches BMAD; only this manual step touches the network.
