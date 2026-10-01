import { describe, it, expect, beforeEach } from "vitest";
import { claimKeyboard, keyboardClaimed, __resetKeyboardOwners } from "../keyboardOwner";

beforeEach(() => __resetKeyboardOwners());

describe("keyboardOwner", () => {
  it("is unclaimed when nothing is open", () => {
    expect(keyboardClaimed()).toBe(false);
  });

  it("is claimed while a panel is open", () => {
    claimKeyboard("scratchpad");
    expect(keyboardClaimed()).toBe(true);
  });

  it("releases when the panel closes", () => {
    const release = claimKeyboard("settings");
    release();
    expect(keyboardClaimed()).toBe(false);
  });

  it("stays claimed while any one of several is still open", () => {
    const releaseA = claimKeyboard("palette");
    claimKeyboard("picker");
    releaseA();
    expect(keyboardClaimed()).toBe(true);
  });

  it("is idempotent, so a remount cannot leave a stale claim", () => {
    claimKeyboard("scratchpad");
    const release = claimKeyboard("scratchpad");
    release();
    expect(keyboardClaimed()).toBe(false);
  });
});
