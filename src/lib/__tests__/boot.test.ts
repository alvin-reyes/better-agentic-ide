import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  /** What `state_read_all` restores. */
  disk: {} as Record<string, string>,
  vault: new Map<string, string>(),
  /** Make every vault call reject with this. */
  vaultFails: null as string | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
    h.calls.push(cmd);
    if (cmd.startsWith("vault_") && h.vaultFails) throw h.vaultFails;
    switch (cmd) {
      case "state_read_all":
        return h.disk;
      case "vault_get": {
        const v = h.vault.get(args.name as string);
        if (v === undefined) throw "not found";
        return v;
      }
      case "vault_set":
        h.vault.set(args.name as string, args.value as string);
        return null;
      default:
        return null; // state_write, state_scrub_secrets, state_snapshot
    }
  }),
}));

import { bootDetached, bootMain } from "../boot";
import { __resetForTests } from "../persistence";

const KEY = "better-terminal-settings";
/** Sync and the launch steps after auto-save, injected as no-ops. */
const noops = () => ({
  syncBeforeLaunch: vi.fn(async () => {}),
  startPeriodicSync: vi.fn(),
  afterAutoSave: vi.fn(async () => {}),
});

beforeEach(() => {
  __resetForTests();
  localStorage.clear();
  h.calls.length = 0;
  h.vault.clear();
  h.vaultFails = null;
  h.disk = { [KEY]: JSON.stringify({ anthropicApiKey: "sk-ant-K", fontSize: 14 }) };
});

describe("B16: boot order", () => {
  it("bootMain moves the key after the restore and before auto-save's first snapshot", async () => {
    const deps = noops();
    await bootMain(deps);
    expect(h.calls).toEqual([
      "state_read_all",
      "vault_get",
      "vault_set",
      "vault_get",
      "state_write",
      "state_scrub_secrets",
      "state_snapshot",
    ]);
    expect(deps.syncBeforeLaunch).toHaveBeenCalledOnce();
    expect(deps.afterAutoSave).toHaveBeenCalledOnce();
    expect(deps.startPeriodicSync).toHaveBeenCalledOnce();
    expect(localStorage.getItem(KEY)).not.toContain("sk-ant-K");
  });

  it("runs sync before the restore, and the later steps after auto-save", async () => {
    const order: string[] = [];
    await bootMain({
      syncBeforeLaunch: async () => void order.push(`sync, then ${h.calls.length} calls`),
      afterAutoSave: async () => void order.push(`after: ${h.calls[h.calls.length - 1]}`),
      startPeriodicSync: () => void order.push("periodic"),
    });
    expect(order).toEqual(["sync, then 0 calls", "after: state_snapshot", "periodic"]);
  });

  it("bootDetached never moves the key or scrubs", async () => {
    await bootDetached();
    expect(h.calls.filter((c) => c.startsWith("vault_") || c === "state_scrub_secrets")).toEqual([]);
  });

  it("a failed move still lets bootMain reach the snapshot", async () => {
    h.vaultFails = "The system keychain isn't available: locked";
    await bootMain(noops());
    expect(h.calls).toEqual(["state_read_all", "vault_get", "state_snapshot"]);
    expect(localStorage.getItem(KEY)).toContain("sk-ant-K");
  });
});
