import { useEffect, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { watchExtensions } from "../../lib/boardWatch";
import { tauriFs } from "../../lib/tauriFs";

/** How often a missing candidate folder is looked for again while the panel is open. */
export const MISSING_FOLDER_RECHECK_MS = 5000;

/**
 * Which of the board's folders exist. Recomputed after each rebuild
 * (`rebuilt` changes), and, while any is missing, every few seconds: a folder
 * that cannot be watched yet cannot report its own creation, and the root is
 * never watched. A folder that appears schedules a rebuild.
 */
export function useExistingFolders(candidates: string[], rebuilt: unknown, onAppeared: () => void): string[] {
  const key = candidates.join("\n");
  const [found, setFound] = useState<{ key: string; dirs: string[] }>({ key: "", dirs: [] });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const check = (dirs: string[]) =>
      Promise.all(dirs.map((d) => tauriFs.exists(d).catch(() => false))).then((ok) => dirs.filter((_, i) => ok[i]));
    const publish = (dirs: string[]) =>
      setFound((prev) => (prev.key === key && prev.dirs.join("\n") === dirs.join("\n") ? prev : { key, dirs }));

    check(candidates).then((present) => {
      if (!live) return;
      publish(present);
      if (present.length === candidates.length) return;
      timer = setInterval(async () => {
        const missing = candidates.filter((d) => !present.includes(d));
        const appeared = await check(missing);
        if (!live || appeared.length === 0) return;
        present = candidates.filter((d) => present.includes(d) || appeared.includes(d));
        publish(present);
        onAppeared();
        if (present.length === candidates.length && timer) clearInterval(timer);
      }, MISSING_FOLDER_RECHECK_MS);
    });
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the folder list and each rebuild
  }, [key, rebuilt]);

  return found.key === key ? found.dirs : [];
}

/** Watch the given folders; any change schedules a rebuild. Re-registers only when the list changes. */
export function useBoardWatch(dirs: string[], methodology: "v4" | "v6" | null, onChange: () => void) {
  const key = `${methodology}\n${dirs.join("\n")}`;
  useEffect(() => {
    let cancelled = false;
    const ids: number[] = [];
    (async () => {
      for (const dir of dirs) {
        if (cancelled) break;
        const channel = new Channel<{ type: string }>();
        channel.onmessage = () => { if (!cancelled) onChange(); };
        const id = await invoke<number>("watch_directory", { dir, extensions: watchExtensions(dir, methodology ?? "v4"), withContent: false, onEvent: channel }).catch(() => null);
        if (id === null) continue;
        if (cancelled) invoke("unwatch_directory", { id }).catch(() => {});
        else ids.push(id);
      }
    })();
    return () => {
      cancelled = true;
      for (const id of ids) invoke("unwatch_directory", { id }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the folder list
  }, [key]);
}
