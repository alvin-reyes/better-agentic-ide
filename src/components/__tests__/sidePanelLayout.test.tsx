import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
  Channel: class { onmessage: unknown = null; },
}));

// The terminal hook loads xterm, which probes a canvas jsdom does not have.
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null) }));

import PreviewPanel from "../PreviewPanel";
import FileBrowser from "../FileBrowser";
import BoardPanel from "../board/BoardPanel";

/**
 * jsdom lays nothing out, so the window-fit guarantee is checked as a budget:
 * every side panel may shrink (flex-shrink 1) down to a stated minimum, and
 * those minimums plus the terminal area's fit the default 1200 px window. The
 * real layout with all three panels open at 1200 px still needs a look in the
 * running app.
 */
const DEFAULT_WINDOW = 1200;

const outer = (el: HTMLElement) => el.firstElementChild as HTMLElement;

function terminalMinWidth(): number {
  const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
  const m = /<div className="overflow-hidden" style=\{\{ minWidth: (\d+), flex: 1 \}\}>/.exec(app);
  if (!m) throw new Error("terminal area not found in App.tsx");
  return Number(m[1]);
}

describe("side panels with file browser, Preview and board all open", () => {
  const panels = () => {
    const { container: fb } = render(<FileBrowser />);
    const { container: pv } = render(<PreviewPanel onClose={vi.fn()} />);
    const { container: bd } = render(<BoardPanel cwd={null} onClose={vi.fn()} />);
    return { fileBrowser: outer(fb), preview: outer(pv), board: outer(bd) };
  };

  it("lets every side panel shrink, to a stated minimum", () => {
    for (const [name, el] of Object.entries(panels())) {
      expect(el.style.flexShrink, name).toBe("1");
      expect(parseFloat(el.style.minWidth), name).toBeGreaterThan(0);
    }
  });

  it("fits the minimums and the terminal area in the default window", () => {
    const p = panels();
    const total = terminalMinWidth() + [p.fileBrowser, p.preview, p.board].reduce((n, el) => n + parseFloat(el.style.minWidth), 0);
    expect(total).toBeLessThanOrEqual(DEFAULT_WINDOW);
  });
});
