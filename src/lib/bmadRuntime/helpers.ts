/**
 * The bundled late ports, dispatched by cli.ts through `import("./helpers")`:
 * one export per ported script, named by the Python stem (Task 5c's interface —
 * `recon_kit`, `init_skill`, …), each with the uniform shape
 * `(argv: string[], fs: Fs) => Promise<{ stdout: string; exitCode: number }>`.
 * cli.ts also reads the camelCase spelling, and the bundler inlines this module
 * into `dist-runtime/ade-runtime.mjs`, so every port that lands here ships in
 * the single-file runtime with no dispatcher change.
 *
 * The module exists, empty, from Task 6 on: the brief's `import("./helpers")`
 * must resolve at bundle time (Rollup fails an unresolved dynamic import), and
 * the two scripts whose ports are not written yet — roster, knowledge,
 * validate_manifests (Task 5b) — dispatch by name through here the moment they
 * are exported.
 */
export {};
