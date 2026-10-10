import { defineConfig } from "vite";

// Single dependency-free ESM bundle scaffolded into v6 projects as
// _bmad/ade-runtime.mjs. Node 18+ target; everything bundled inline.
export default defineConfig({
  // The frontend's public assets have no place in the runtime bundle's output.
  publicDir: false,
  build: {
    lib: { entry: "src/lib/bmadRuntime/cli.ts", formats: ["es"], fileName: "ade-runtime" },
    outDir: "dist-runtime",
    target: "node18",
    minify: false,
    rollupOptions: {
      // Node built-ins are the runtime's, not dependencies: leaving them as
      // imports keeps them out of the bundle, where a client-environment lib
      // build would otherwise stub them "for browser compatibility" and leave
      // realFs reading nothing. Every npm package (smol-toml, @noble/hashes)
      // is bundled inline.
      external: (id) => id.startsWith("node:"),
      // One file: the late ports cli.ts imports dynamically are inlined rather
      // than emitted as sibling chunks that nothing copies to the project.
      output: { inlineDynamicImports: true },
    },
  },
});
