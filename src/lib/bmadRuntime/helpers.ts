/**
 * The bundled late ports, dispatched by cli.ts through `import("./helpers")`:
 * one export per ported script, named by the Python stem (Task 5c's interface —
 * `recon_kit`, `init_skill`, …), each with the uniform shape
 * `(argv: string[], fs: Fs) => Promise<{ stdout: string; exitCode: number }>`.
 * cli.ts also reads the camelCase spelling, and the bundler inlines this module
 * into `dist-runtime/ade-runtime.mjs`, so every port that lands here ships in
 * the single-file runtime with no dispatcher change.
 *
 * Task 5b's trio lives in its own modules (they share `knowledge.ts`'s scan and
 * document reader the way the Python modules share `knowledge.py`); this file
 * re-exports them so the CLI's name lookup — `helpers[script] ??
 * helpers[camel(script)]` — finds `roster`, `knowledge` and
 * `validate_manifests` → `validateManifests`.
 */
export { knowledge } from "./knowledge";
export { roster } from "./roster";
export { validateManifests } from "./validateManifests";
