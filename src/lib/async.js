/** Let React paint loading UI before blocking Tauri invoke calls. */
export function yieldToUi() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
