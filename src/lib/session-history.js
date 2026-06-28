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
    log: "",
  });
  writeStore(records);
}

export function appendSessionLog(sessionId, chunk) {
  if (!chunk) return;
  const store = readStore();
  const record = store.records.find((r) => r.id === sessionId);
  if (!record) return;
  record.log += chunk;
  writeStore(store.records);
}

export function updateSessionRecord(sessionId, patch) {
  const store = readStore();
  const record = store.records.find((r) => r.id === sessionId);
  if (!record) return;
  Object.assign(record, patch);
  writeStore(store.records);
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
  return next.length !== store.records.length;
}

export function clearSessionHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function previewLog(log, maxLen = 120) {
  const plain = log.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
  const line = plain.split("\n").find((l) => l.trim()) ?? "";
  return line.length > maxLen ? `${line.slice(0, maxLen)}…` : line;
}

export function stripAnsi(log = "") {
  return log.replace(/\x1b\[[0-9;]*m/g, "");
}
