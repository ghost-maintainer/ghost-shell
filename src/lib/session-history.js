import { invoke } from "./tauri";

const STORAGE_KEY = "ghost-shell-session-history";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [] };
    const parsed = JSON.parse(raw);
    return { records: Array.isArray(parsed.records) ? parsed.records : [] };
  } catch {
    return { records: [] };
  }
}

function writeStore(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ records }));
}

export function pruneExpiredSessions() {
  const cutoff = Date.now() - RETENTION_MS;
  const store = readStore();
  const kept = store.records.filter((r) => r.startedAt >= cutoff);
  if (kept.length !== store.records.length) {
    writeStore(kept);
    // Delete expired log files asynchronously
    const expired = store.records.filter((r) => r.startedAt < cutoff);
    for (const record of expired) {
      invoke("delete_session_log_file", { sessionId: record.id }).catch(() => {});
    }
  }
  return kept;
}

export function listSessionHistory() {
  return pruneExpiredSessions().sort((a, b) => b.startedAt - a.startedAt);
}

export function getSessionLog(sessionId) {
  pruneExpiredSessions();
  return readStore().records.find((r) => r.id === sessionId) ?? null;
}

export function createSessionRecord({ id, host }) {
  const records = pruneExpiredSessions();
  if (records.some((r) => r.id === id)) return;

  records.push({
    id,
    hostId: host.id,
    hostName: host.name,
    hostAddress: host.address,
    port: host.port,
    username: host.username,
    key_id: host.key_id ?? null,
    startedAt: Date.now(),
    endedAt: null,
    status: "active",
  });
  writeStore(records);
  triggerLogSync().catch(() => {});
}

export function appendSessionLog(sessionId, chunk) {
  if (!chunk) return;
  invoke("append_session_log", { sessionId, chunk }).catch((err) => {
    console.error("Failed to append session log to disk:", err);
  });
}

export function updateSessionRecord(sessionId, patch) {
  const store = readStore();
  const record = store.records.find((r) => r.id === sessionId);
  if (!record) return;
  Object.assign(record, patch);
  writeStore(store.records);
  triggerLogSync().catch(() => {});
}

export function finalizeSessionRecord(sessionId, status = "closed") {
  updateSessionRecord(sessionId, {
    status,
    endedAt: Date.now(),
  });
}

export function deleteSessionLog(sessionId) {
  const store = readStore();
  const next = store.records.filter((r) => r.id !== sessionId);
  writeStore(next);
  invoke("delete_session_log_file", { sessionId }).catch(() => {});
  triggerLogSync().catch(() => {});
  return next.length !== store.records.length;
}

export function clearSessionHistory() {
  const store = readStore();
  for (const record of store.records) {
    invoke("delete_session_log_file", { sessionId: record.id }).catch(() => {});
  }
  localStorage.removeItem(STORAGE_KEY);
  triggerLogSync().catch(() => {});
}

export async function triggerLogSync() {
  try {
    const unlocked = await invoke("is_unlocked").catch(() => false);
    if (!unlocked) return;

    const cloudStatus = await invoke("get_cloud_status").catch(() => null);
    if (!cloudStatus || cloudStatus.is_offline || !cloudStatus.session_token) {
      return; // Offline mode, do nothing
    }

    const store = readStore();
    const merged = await invoke("sync_logs", { localRecords: store.records });
    if (Array.isArray(merged)) {
      writeStore(merged);
      window.dispatchEvent(new CustomEvent("logs-synced"));
    }
  } catch (err) {
    console.error("Log sync failed:", err);
  }
}

export function previewLog(log, maxLen = 120) {
  const plain = log.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
  const line = plain.split("\n").find((l) => l.trim()) ?? "";
  return line.length > maxLen ? `${line.slice(0, maxLen)}…` : line;
}

export function stripAnsi(log = "") {
  return log.replace(/\x1b\[[0-9;]*m/g, "");
}

