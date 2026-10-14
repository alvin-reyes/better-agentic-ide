import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const backend = vi.hoisted(() => ({
  info: { project: "/p", enabled: false, unavailable: null as string | null },
  toggleError: null as string | null,
  calls: [] as [string, unknown][],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: { on?: boolean }) => {
    backend.calls.push([cmd, args]);
    if (cmd === "agent_status_get") return { ...backend.info };
    if (cmd === "agent_status_toggle") {
      if (backend.toggleError) throw backend.toggleError;
      backend.info.enabled = !!args.on;
      return { ...backend.info };
    }
    return null;
  }),
  Channel: class { onmessage: unknown = null; },
}));

import AgentStatusToggle from "../AgentStatusToggle";

const platform = Object.getOwnPropertyDescriptor(Navigator.prototype, "platform");
const setPlatform = (p: string) => Object.defineProperty(navigator, "platform", { value: p, configurable: true });

beforeEach(() => {
  backend.info = { project: "/p", enabled: false, unavailable: null };
  backend.toggleError = null;
  backend.calls = [];
  setPlatform("MacIntel");
});
afterEach(() => {
  cleanup();
  if (platform) Object.defineProperty(navigator, "platform", platform);
});

const box = () => screen.getByRole("checkbox", { name: /Agent status/ }) as HTMLInputElement;

describe("AgentStatusToggle", () => {
  it("turns Agent status on and off for the folder's project", async () => {
    render(<AgentStatusToggle cwd="/p/sub" />);
    await screen.findByText(/Off\./);
    expect(box().checked).toBe(false);
    fireEvent.click(box());
    await screen.findByText(/On for \/p\./);
    expect(box().checked).toBe(true);
    expect(backend.calls).toContainEqual(["agent_status_toggle", { cwd: "/p/sub", on: true }]);
    fireEvent.click(box());
    await screen.findByText(/Off\./);
    expect(backend.calls).toContainEqual(["agent_status_toggle", { cwd: "/p/sub", on: false }]);
  });

  it("says why it can't work in this ADE", async () => {
    backend.info.unavailable = "The Agent status helper is missing";
    render(<AgentStatusToggle cwd="/p" />);
    await screen.findByText(/The Agent status helper is missing/);
  });

  it("shows a settings error and changes nothing", async () => {
    backend.toggleError = "\"hooks\" in .claude/settings.local.json has an unexpected shape";
    render(<AgentStatusToggle cwd="/p" />);
    await screen.findByText(/Off\./);
    fireEvent.click(box());
    await screen.findByText(/unexpected shape/);
    await waitFor(() => expect(box().checked).toBe(false));
  });

  it("isn't offered on Windows", () => {
    setPlatform("Win32");
    render(<AgentStatusToggle cwd="/p" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(backend.calls).toEqual([]);
  });
});
