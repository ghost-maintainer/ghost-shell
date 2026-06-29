export function stripAnsi(text) {
  if (!text) return "";
  return text.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}

export function previewLog(text) {
  return stripAnsi(text).substring(0, 150);
}

export function pruneExpiredSessions() {
  return [];
}

export function listSessionHistory() {
  return [];
}

export function getSessionLog(sessionId) {
  return null;
}

export function createSessionRecord({ id, host }) {
  // Disabled
}

export function appendSessionLog(sessionId, chunk) {
  // Disabled
}

export function updateSessionRecord(sessionId, patch) {
  // Disabled
}

export function finalizeSessionRecord(sessionId, status = "closed") {
  // Disabled
}

export function deleteSessionLog(sessionId) {
  return false;
}

export function clearSessionHistory() {
  // Disabled
}

export async function syncSessionLogOneByOne(sessionId) {
  // Disabled
}

export async function triggerLogSync() {
  // Disabled
}
