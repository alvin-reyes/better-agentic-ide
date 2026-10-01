/**
 * Whether an editor tab has unsaved changes.
 *
 * EditorTab owns the answer, so this is an event round-trip: ask, and take the
 * first reply for that tab. A tab that never answers — it was closed, or it is
 * not an editor — resolves `false` after a short wait, because blocking a close
 * on a tab that cannot reply would be worse than closing one extra file.
 */
export function editorDirty(tabId: string, timeoutMs = 100): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: number;
    const done = (value: boolean) => {
      window.removeEventListener("editor-dirty-response", onResponse);
      window.clearTimeout(timer);
      resolve(value);
    };
    const onResponse = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.tabId === tabId) done(!!detail.isDirty);
    };
    window.addEventListener("editor-dirty-response", onResponse);
    // Set before dispatching: a synchronous reply would otherwise leave the
    // timer unassigned and the listener attached for good.
    timer = window.setTimeout(() => done(false), timeoutMs);
    window.dispatchEvent(new CustomEvent("editor-dirty-check", { detail: { tabId } }));
  });
}

/** Which of these tabs are editors holding unsaved changes. */
export async function unsavedEditorTabs(
  tabs: { id: string; type?: string }[],
  timeoutMs = 100,
): Promise<string[]> {
  const editors = tabs.filter((t) => t.type === "editor");
  const answers = await Promise.all(
    editors.map(async (t) => [t.id, await editorDirty(t.id, timeoutMs)] as const),
  );
  return answers.filter(([, dirty]) => dirty).map(([id]) => id);
}
