import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/** Invoke that ignores stale-callback errors after HMR / page reload. */
export async function invoke(cmd, args) {
  try {
    return await tauriInvoke(cmd, args);
  } catch (err) {
    const message = String(err);
    if (message.includes("Couldn't find callback id")) return;
    throw err;
  }
}
