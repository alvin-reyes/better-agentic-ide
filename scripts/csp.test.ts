import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The CSP was tightened to `script-src 'self'` to drop a CDN and 'unsafe-eval'.
 * That also silently broke the terminal's inline images: @xterm/addon-image
 * decodes sixel and iTerm images in WebAssembly, and compiling wasm needs its
 * own grant. v0.18.0 shipped logging this on every single start:
 *
 *   CompileError: Refused to create a WebAssembly object because
 *   'unsafe-eval' or 'wasm-unsafe-eval' is not an allowed source of script
 *
 * 'wasm-unsafe-eval' permits wasm compilation and nothing else — it does NOT
 * re-admit eval() or new Function(), which is the whole point of using it
 * rather than relaxing back to 'unsafe-eval'.
 */
const CONF = resolve(__dirname, "..", "src-tauri", "tauri.conf.json");
const csp: string = JSON.parse(readFileSync(CONF, "utf8")).app.security.csp;
const directive = (name: string) =>
  csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) ?? "";

describe("content security policy", () => {
  it("lets WebAssembly compile, so terminal images still render", () => {
    expect(directive("script-src")).toContain("'wasm-unsafe-eval'");
  });

  it("still refuses eval", () => {
    // 'wasm-unsafe-eval' must not be mistaken for, or widened back to, this.
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("still loads scripts only from the app itself", () => {
    const scriptSrc = directive("script-src");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).not.toMatch(/https?:\/\//);
  });

  it("the addon that needs wasm is actually loaded, or this grant is dead weight", () => {
    const useTerminal = readFileSync(
      join(resolve(__dirname, ".."), "src", "hooks", "useTerminal.ts"),
      "utf8",
    );
    expect(useTerminal).toContain("ImageAddon");
  });
});
