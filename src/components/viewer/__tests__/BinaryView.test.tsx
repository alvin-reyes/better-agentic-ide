import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import BinaryView from "../BinaryView";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const img = () => screen.queryByRole("img") as HTMLImageElement | null;

beforeEach(() => { vi.mocked(invoke).mockReset(); });

describe("BinaryView", () => {
  it("a reload keeps the current view", async () => {
    const reads: ReturnType<typeof deferred<string>>[] = [];
    vi.mocked(invoke).mockImplementation(() => {
      const d = deferred<string>();
      reads.push(d);
      return d.promise;
    });
    const { rerender } = render(<BinaryView path="/r/shot.png" reloadKey={0} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    await act(async () => { reads[0].resolve("AAAA"); });
    expect(img()?.getAttribute("src")).toBe("data:image/png;base64,AAAA");

    // Only reloadKey changes: the image stays until the new bytes arrive.
    rerender(<BinaryView path="/r/shot.png" reloadKey={1} />);
    expect(reads).toHaveLength(2);
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(img()?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    await act(async () => { reads[1].resolve("BBBB"); });
    expect(img()?.getAttribute("src")).toBe("data:image/png;base64,BBBB");

    // Another path: its own load, so "Loading…", never the old image.
    rerender(<BinaryView path="/r/other.png" reloadKey={1} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(img()).toBeNull();
  });

  it("a failed read says Can't open <name> in a role=status message", async () => {
    vi.mocked(invoke).mockImplementation(async () => { throw "Not a regular file: /r/dev.png"; });
    render(<BinaryView path="/r/dev.png" reloadKey={0} />);
    const el = await screen.findByText("Can't open dev.png: Not a regular file: /r/dev.png");
    const status = el.closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
  });
});
