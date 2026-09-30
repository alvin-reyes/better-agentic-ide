/** Long enough for the splash animation to play once; shorter loads wait for it. */
const MIN_VISIBLE_MS = 900;

/** Fade out and remove the launch splash from index.html. Safe to call more than once. */
export function hideSplash(immediately = false): void {
  const el = document.getElementById("splash");
  if (!el || el.dataset.hiding) return;
  el.dataset.hiding = "1";
  const wait = immediately ? 0 : Math.max(0, MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    el.classList.add("splash--out");
    window.setTimeout(() => el.remove(), 350);
  }, wait);
}
