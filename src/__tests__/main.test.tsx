import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

/**
 * main.tsx picks one launch sequence, and only after it has finished loads
 * the settings store (which reads localStorage when first evaluated), paints
 * the theme and renders. Each step is recorded in one log.
 */
const h = vi.hoisted(() => ({ events: [] as string[] }));

const settle = () => new Promise((r) => setTimeout(r, 5));

vi.mock("../lib/boot", () => ({
  bootMain: vi.fn(async () => {
    h.events.push("bootMain:start");
    await settle();
    h.events.push("bootMain:end");
  }),
  bootDetached: vi.fn(async () => {
    h.events.push("bootDetached:start");
    await settle();
    h.events.push("bootDetached:end");
  }),
}));

vi.mock("react-dom/client", () => ({
  default: { createRoot: () => ({ render: () => void h.events.push("render") }) },
  createRoot: () => ({ render: () => void h.events.push("render") }),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));
vi.mock("../lib/docLinks", () => ({ installLinkGuard: vi.fn() }));
vi.mock("../lib/splash", () => ({ hideSplash: vi.fn() }));
vi.mock("../components/ErrorBoundary", () => ({ default: ({ children }: { children: unknown }) => children }));

async function launch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
  vi.resetModules();
  h.events.length = 0;
  // Registered per launch, so its factory runs on this launch's first import:
  // that moment is what is being checked.
  vi.doMock("../stores/settingsStore", () => {
    h.events.push("settingsStore");
    return {
      useSettingsStore: { getState: () => ({ getActiveTheme: () => ({}) }) },
      applyThemeToDOM: () => void h.events.push("theme"),
    };
  });
  await import("../main");
  await waitFor(() => expect(h.events).toContain("render"));
}

beforeEach(() => {
  vi.stubGlobal("__APP_VERSION__", "test");
  document.body.innerHTML = '<div id="root"></div>';
});

describe("main.tsx launch order", () => {
  it("the main window runs only bootMain, and finishes it before loading the settings store", async () => {
    await launch("");
    expect(h.events).toEqual(["bootMain:start", "bootMain:end", "settingsStore", "theme", "render"]);
  });

  it("a detached window runs only bootDetached, and finishes it before loading the settings store", async () => {
    await launch(`?detached=${encodeURIComponent(JSON.stringify({ id: "t1", kind: "terminal" }))}`);
    expect(h.events).toEqual(["bootDetached:start", "bootDetached:end", "settingsStore", "theme", "render"]);
  });
});
