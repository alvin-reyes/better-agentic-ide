import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TokensPanel from "../TokensPanel";
import type { SessionUsage } from "../../lib/tokenUsage";

const disk = vi.hoisted(() => ({ sessions: [] as unknown[], audit: null as unknown }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "token_usage") return { sessions: disk.sessions, filesScanned: disk.sessions.length };
    if (cmd === "context_audit") return disk.audit;
    return null;
  }),
  Channel: class { onmessage: unknown = null; },
}));

const session = (o: Partial<SessionUsage> = {}): SessionUsage => ({
  id: "s", cwd: "/p", title: null, firstAt: null, lastAt: null, models: [], subagentRequests: 0,
  contextTokens: 0, peakContextTokens: 0, model: "claude-opus-5-5", compactions: 0,
  commandRuns: 0, commandOutputChars: 0, largestCommandOutput: 0, ...o,
});

const audit = (o: Record<string, unknown> = {}) => ({
  root: "/p", memoryFiles: [], heavy: [], mcpServers: [], denyRules: [], presets: {}, presetValues: {}, ...o,
});

/** A full context, a cold cache, two full windows, three compactions and heavy command output: six tips. */
const busy = () => [
  session({
    id: "a", title: "Rework billing", contextTokens: 800_000, peakContextTokens: 900_000, compactions: 3,
    commandRuns: 40, commandOutputChars: 400_000, largestCommandOutput: 20_000,
    models: [{ model: "claude-opus-5-5", requests: 30, input: 100_000, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }],
  }),
  session({ id: "b", peakContextTokens: 900_000 }),
];

const titles = () => [...document.querySelectorAll(".tokens-tips li b")].map((b) => b.textContent);

afterEach(cleanup);

describe("TokensPanel tips", () => {
  it("lists the first six tips and the rest behind a button", async () => {
    disk.sessions = busy();
    disk.audit = audit({
      memoryFiles: [{ path: "/p/CLAUDE.md", bytes: 40_000 }],
      heavy: [{ path: "node_modules", isDir: true, bytes: 1 << 21, rule: "Read(./node_modules/**)", denied: false }],
    });
    render(<TokensPanel cwd="/p" onClose={() => {}} />);
    const more = await screen.findByRole("button", { name: "Show 2 more" });
    // The strongest stay in front: the high tip, then the medium ones in order.
    expect(titles()).toEqual([
      "The latest session resends 800k tokens every turn",
      "Only 0% of prompt tokens came from cache",
      "CLAUDE.md files add about 10k tokens to every request",
      "1 generated or dependency path is open to the agent",
      "2 sessions filled 80% or more of the context window",
      "Rework billing was compacted 3 times",
    ]);
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(titles()).toHaveLength(8);
    expect(titles().slice(6)).toEqual([
      "Command output added about 100k tokens over 40 runs",
      "The largest command output was 20,000 characters",
    ]);
    // The same button stays, so keyboard focus is not dropped.
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer).toBe(more);
    expect(fewer.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(fewer);
    expect(titles()).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show 2 more" })).toBeTruthy();
  });

  it("collapses the list again when the period or the scope changes", async () => {
    disk.sessions = busy();
    disk.audit = audit({
      memoryFiles: [{ path: "/p/CLAUDE.md", bytes: 40_000 }],
      heavy: [{ path: "node_modules", isDir: true, bytes: 1 << 21, rule: "Read(./node_modules/**)", denied: false }],
    });
    render(<TokensPanel cwd="/p" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Show 2 more" }));
    expect(titles()).toHaveLength(8);
    fireEvent.click(screen.getByRole("tab", { name: "30 days" }));
    await screen.findByRole("button", { name: "Show 2 more" });
    expect(titles()).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    // All projects: this folder's settings no longer decide a tip, so the
    // Bash-limit tip goes, and the list is collapsed again.
    fireEvent.click(screen.getByRole("tab", { name: "All projects" }));
    await screen.findByRole("button", { name: "Show 1 more" });
    expect(titles()).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(titles()).not.toContain("The largest command output was 20,000 characters");
    expect(titles()).toHaveLength(7);
  });

  it("shows no button for six tips or fewer", async () => {
    disk.sessions = busy();
    disk.audit = audit();
    render(<TokensPanel cwd="/p" onClose={() => {}} />);
    await screen.findByText("The largest command output was 20,000 characters");
    expect(titles()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull();
  });
});
