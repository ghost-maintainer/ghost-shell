/** Production-only UI hardening (dev keeps context menu for debugging). */
export function initProductionGuards() {
  if (!import.meta.env.PROD) return;

  document.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault();
    },
    { capture: true },
  );
}
