import React from "react";
import { Channel } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useSecurity } from "@/provider/security-provider";
import { yieldToUi } from "@/lib/async";
import { invoke } from "@/lib/tauri";
import {
  appendSessionLog,
  createSessionRecord,
  finalizeSessionRecord,
  getSessionLog,
  updateSessionRecord,
} from "@/lib/session-history";

export const TerminalContext = React.createContext(null);
const STORAGE_KEY = "ghost-shell-terminal-sessions";

function getXtermTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  return {
    background: isDark ? "#141414" : "#ffffff",
    foreground: isDark ? "#e5e5e5" : "#171717",
    cursor: "#22c55e",
    selectionBackground: isDark ? "#264f3a" : "#bbf7d0",
  };
}

function writeStatusLine(term, stage, message) {
  term.writeln(`\r\n\x1b[90m[${stage}] ${message}\x1b[0m`);
}

function captureScrollback(term) {
  const buffer = term.buffer.active;
  const lines = [];
  for (let i = 0; i < buffer.length; i++) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
  }
  return lines.join("\n");
}

function createWriteFlusher(sessionId, onUserInput) {
  let pending = "";
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (!pending) return;
    const chunk = pending;
    pending = "";
    onUserInput?.(chunk);
    invoke("ssh_write", {
      sessionId,
      data: new TextEncoder().encode(chunk),
    }).catch(() => {});
  };

  return (data) => {
    pending += data;
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  };
}

function createTerminalInstance(sessionId, onUserInput) {
  const term = new Terminal({
    scrollback: 10000,
    convertEol: true,
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace",
    theme: getXtermTheme(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);

  term.onData(createWriteFlusher(sessionId, onUserInput));

  let resizeTimer;
  term.onResize(({ cols, rows }) => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      invoke("ssh_resize", { sessionId, cols, rows }).catch(() => {});
    }, 100);
  });

  return { term, fit };
}

function loadPersistedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function savePersistedState(
  sessions,
  activeId,
  runtimesRef,
  { captureBuffers = false } = {},
) {
  let buffers = {};
  if (captureBuffers) {
    for (const session of sessions) {
      const runtime = runtimesRef.current.get(session.id);
      if (runtime?.term) {
        buffers[session.id] = captureScrollback(runtime.term);
      }
    }
  } else {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        buffers = JSON.parse(raw).buffers ?? {};
      }
    } catch {
      buffers = {};
    }
  }

  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        stage: s.stage,
        stageMessage: s.stageMessage,
        wasConnected: s.status === "connected",
        host: {
          id: s.host.id,
          name: s.host.name,
          address: s.host.address,
          port: s.host.port,
          username: s.host.username,
          key_id: s.host.key_id ?? null,
        },
      })),
      activeId,
      buffers,
    }),
  );
}

function clearPersistedState() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function TerminalProvider({ children }) {
  const { unlocked } = useSecurity();
  const [sessions, setSessions] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [authPrompt, setAuthPrompt] = React.useState(null);
  const runtimesRef = React.useRef(new Map());
  const connectQueueRef = React.useRef(new Set());
  const restoredRef = React.useRef(false);
  const persistTimerRef = React.useRef(null);
  const logFlushTimersRef = React.useRef(new Map());
  const hadSessionsRef = React.useRef(false);
  const sessionsRef = React.useRef(sessions);
  const activeIdRef = React.useRef(activeId);

  React.useEffect(() => {
    sessionsRef.current = sessions;
    activeIdRef.current = activeId;
    if (sessions.length > 0) hadSessionsRef.current = true;
  }, [sessions, activeId]);

  const flushRuntimeLog = React.useCallback((sessionId) => {
    const runtime = runtimesRef.current.get(sessionId);
    if (!runtime?.pendingLog) return;
    appendSessionLog(sessionId, runtime.pendingLog);
    runtime.pendingLog = "";
    clearTimeout(logFlushTimersRef.current.get(sessionId));
    logFlushTimersRef.current.delete(sessionId);
  }, []);

  const appendRuntimeLog = React.useCallback(
    (sessionId, chunk) => {
      const runtime = runtimesRef.current.get(sessionId);
      if (!runtime || !chunk) return;
      runtime.pendingLog = (runtime.pendingLog ?? "") + chunk;
      if (logFlushTimersRef.current.has(sessionId)) return;
      logFlushTimersRef.current.set(
        sessionId,
        setTimeout(() => flushRuntimeLog(sessionId), 2000),
      );
    },
    [flushRuntimeLog],
  );

  const updateSession = React.useCallback((id, patch) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    if (patch.status) {
      updateSessionRecord(id, { status: patch.status });
    }
  }, []);

  const refreshTerminal = React.useCallback((sessionId) => {
    const runtime = runtimesRef.current.get(sessionId);
    if (!runtime?.term || !runtime?.fit) return;

    const mountEl = runtime.mountEl;
    if (!mountEl || !mountEl.isConnected) return;

    try {
      runtime.fit.fit();
      runtime.term.refresh(0, Math.max(runtime.term.rows - 1, 0));
    } catch {
      /* ignore fit errors during layout */
    }
  }, []);

  const connectSession = React.useCallback(
    async (sessionId, secrets = {}) => {
      const runtime = runtimesRef.current.get(sessionId);
      if (!runtime) return;

      updateSession(sessionId, {
        status: "connecting",
        stage: "init",
        stageMessage: "Starting connection...",
        authType: null,
      });

      if (runtime.channel) {
        runtime.channel.onmessage = null;
      }

      const channel = new Channel();
      runtime.channel = channel;

      channel.onmessage = (event) => {
        switch (event.type) {
          case "status": {
            const line = `\r\n[${event.stage}] ${event.message}\r\n`;
            updateSession(sessionId, {
              stage: event.stage,
              stageMessage: event.message,
            });
            writeStatusLine(runtime.term, event.stage, event.message);
            appendRuntimeLog(sessionId, line);
            break;
          }
          case "connected":
            updateSession(sessionId, {
              status: "connected",
              stage: "connected",
              stageMessage: "Connected",
              authType: null,
            });
            appendRuntimeLog(sessionId, "\r\n── Connected ──\r\n");
            if (runtime.pendingCredentialSave) {
              const { type, value, hostId, keyId } = runtime.pendingCredentialSave;
              delete runtime.pendingCredentialSave;
              if (type === "password") {
                invoke("save_host_password", { hostId, password: value }).catch(
                  () => {},
                );
                runtime.host = { ...runtime.host, password: value };
              } else if (keyId) {
                invoke("save_key_passphrase", {
                  keyId,
                  passphrase: value,
                }).catch(() => {});
              }
            }
            break;
          case "data": {
            const bytes = new Uint8Array(event.bytes);
            runtime.term.write(bytes);
            appendRuntimeLog(
              sessionId,
              new TextDecoder().decode(bytes, { stream: true }),
            );
            break;
          }
          case "closed": {
            const line = `\r\n${event.message}\r\n`;
            updateSession(sessionId, {
              status: "disconnected",
              stageMessage: event.message,
            });
            runtime.term.writeln(`\r\n\x1b[33m${event.message}\x1b[0m`);
            appendRuntimeLog(sessionId, line);
            flushRuntimeLog(sessionId);
            break;
          }
          case "error": {
            const line = `\r\nError: ${event.message}\r\n`;
            updateSession(sessionId, {
              status: "error",
              stageMessage: event.message,
            });
            runtime.term.writeln(`\r\n\x1b[31m${event.message}\x1b[0m`);
            appendRuntimeLog(sessionId, line);
            flushRuntimeLog(sessionId);
            break;
          }
          case "needPassword":
            updateSession(sessionId, {
              status: "auth-required",
              authType: "password",
            });
            setAuthPrompt({ sessionId, type: "password" });
            break;
          case "needPassphrase":
            updateSession(sessionId, {
              status: "auth-required",
              authType: "passphrase",
            });
            setAuthPrompt({ sessionId, type: "passphrase" });
            break;
          default:
            break;
        }
      };

      await yieldToUi();

      try {
        refreshTerminal(sessionId);
        await invoke("ssh_connect", {
          sessionId,
          hostId: runtime.host.id,
          cols: runtime.term.cols,
          rows: runtime.term.rows,
          password: secrets.password ?? null,
          passphrase: secrets.passphrase ?? null,
          onEvent: channel,
        });
      } catch (err) {
        const message = String(err);
        if (!message.includes("Couldn't find callback id")) {
          updateSession(sessionId, {
            status: "error",
            stageMessage: message,
          });
          runtime.term.writeln(`\r\n\x1b[31mError: ${message}\x1b[0m`);
          appendRuntimeLog(sessionId, `\r\nError: ${message}\r\n`);
        }
      }
    },
    [updateSession, refreshTerminal, appendRuntimeLog, flushRuntimeLog],
  );

  const attachTerminal = React.useCallback(
    (sessionId, element) => {
      const runtime = runtimesRef.current.get(sessionId);
      if (!runtime || !element) return;

      const detached =
        runtime.opened &&
        runtime.mountEl &&
        (!runtime.term.element?.isConnected ||
          runtime.term.element.parentElement !== element);

      if (detached) {
        runtime.savedScrollback = captureScrollback(runtime.term);
        runtime.term.dispose();
        const { term, fit } = createTerminalInstance(sessionId, (data) =>
          appendRuntimeLog(sessionId, data),
        );
        runtime.term = term;
        runtime.fit = fit;
        runtime.opened = false;
      }

      runtime.mountEl = element;

      if (!runtime.opened) {
        runtime.term.open(element);
        runtime.opened = true;
        const scrollback =
          runtime.savedScrollback || getSessionLog(sessionId)?.log || "";
        if (scrollback) {
          runtime.term.write(scrollback);
          runtime.savedScrollback = null;
        }
        if (connectQueueRef.current.has(sessionId)) {
          connectQueueRef.current.delete(sessionId);
          connectSession(sessionId);
        }
      }

      refreshTerminal(sessionId);
      if (sessionId === activeId) {
        runtime.term.focus();
      }
    },
    [connectSession, activeId, refreshTerminal, appendRuntimeLog],
  );

  const registerRuntime = React.useCallback(
    (id, host, meta, scrollback = "", append = true, createHistory = true) => {
      const { term, fit } = createTerminalInstance(id, (data) =>
        appendRuntimeLog(id, data),
      );
      runtimesRef.current.set(id, {
        term,
        fit,
        host,
        channel: null,
        opened: false,
        mountEl: null,
        savedScrollback: scrollback,
        pendingLog: "",
      });

      if (createHistory) {
        createSessionRecord({ id, host });
      }

      const session = {
        id,
        host,
        title: meta.title ?? host.name,
        status: meta.status ?? "disconnected",
        stage: meta.stage ?? "restored",
        stageMessage:
          meta.stageMessage ?? "Session restored — reconnect to continue",
        authType: null,
      };

      if (append) {
        setSessions((prev) => [...prev, session]);
      }
      return session;
    },
    [appendRuntimeLog],
  );

  const openSession = React.useCallback(
    (host) => {
      const id = `session-${host.id}-${Date.now()}`;
      registerRuntime(id, host, {
        title: host.name,
        status: "connecting",
        stage: "init",
        stageMessage: "Waiting for terminal...",
      });
      setActiveId(id);
      connectQueueRef.current.add(id);
      return id;
    },
    [registerRuntime],
  );

  const setActive = React.useCallback(
    (id) => {
      setActiveId(id);
      if (!id) return;

      requestAnimationFrame(() => {
        refreshTerminal(id);
        requestAnimationFrame(() => {
          refreshTerminal(id);
          runtimesRef.current.get(id)?.term.focus();
        });
      });
    },
    [refreshTerminal],
  );

  const persistNow = React.useCallback((captureBuffers = false) => {
    const currentSessions = sessionsRef.current;
    if (currentSessions.length === 0) return;
    for (const session of currentSessions) {
      flushRuntimeLog(session.id);
    }
    savePersistedState(currentSessions, activeIdRef.current, runtimesRef, {
      captureBuffers,
    });
  }, [flushRuntimeLog]);

  const schedulePersist = React.useCallback(
    (captureBuffers = false) => {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(
        () => persistNow(captureBuffers),
        captureBuffers ? 0 : 3000,
      );
    },
    [persistNow],
  );

  const closeSession = React.useCallback(
    (id) => {
      flushRuntimeLog(id);
      persistNow(true);
      finalizeSessionRecord(id, "closed");
      invoke("ssh_disconnect", { sessionId: id }).catch(() => {});
      const runtime = runtimesRef.current.get(id);
      if (runtime) {
        runtime.term.dispose();
        runtimesRef.current.delete(id);
      }
      connectQueueRef.current.delete(id);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        if (activeId === id) {
          setActiveId(next.length ? next[next.length - 1].id : null);
        }
        return next;
      });
      setAuthPrompt((prev) => (prev?.sessionId === id ? null : prev));
    },
    [activeId, persistNow, flushRuntimeLog],
  );

  const reconnect = React.useCallback(
    (id) => {
      const runtime = runtimesRef.current.get(id);
      if (!runtime) return;
      const line = "\r\n── Reconnecting ──\r\n";
      runtime.term.writeln("\r\n\x1b[90m── Reconnecting ──\x1b[0m");
      appendRuntimeLog(id, line);
      setAuthPrompt((prev) => (prev?.sessionId === id ? null : prev));
      connectSession(id);
    },
    [connectSession, appendRuntimeLog],
  );

  const disposeRuntimes = React.useCallback(() => {
    clearTimeout(persistTimerRef.current);
    const currentSessions = sessionsRef.current;
    const currentActiveId = activeIdRef.current;
    if (currentSessions.length > 0) {
      for (const session of currentSessions) {
        flushRuntimeLog(session.id);
      }
      savePersistedState(currentSessions, currentActiveId, runtimesRef, {
        captureBuffers: true,
      });
    }
    for (const id of [...runtimesRef.current.keys()]) {
      invoke("ssh_disconnect", { sessionId: id }).catch(() => {});
      runtimesRef.current.get(id)?.term.dispose();
    }
    runtimesRef.current.clear();
    connectQueueRef.current.clear();
    setSessions((prev) => (prev.length === 0 ? prev : []));
    setActiveId((prev) => (prev === null ? prev : null));
    setAuthPrompt((prev) => (prev === null ? prev : null));
    restoredRef.current = false;
  }, [flushRuntimeLog]);

  const closeAll = React.useCallback(() => {
    for (const session of sessionsRef.current) {
      flushRuntimeLog(session.id);
      finalizeSessionRecord(session.id, "closed");
    }
    disposeRuntimes();
    clearPersistedState();
  }, [disposeRuntimes, flushRuntimeLog]);

  const failSession = React.useCallback(
    (sessionId, message) => {
      invoke("ssh_disconnect", { sessionId }).catch(() => {});
      const runtime = runtimesRef.current.get(sessionId);
      updateSession(sessionId, {
        status: "error",
        stageMessage: message,
        authType: null,
      });
      if (runtime?.term) {
        runtime.term.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
      }
      appendRuntimeLog(sessionId, `\r\n${message}\r\n`);
      flushRuntimeLog(sessionId);
    },
    [updateSession, appendRuntimeLog, flushRuntimeLog],
  );

  const cancelAuth = React.useCallback(() => {
    if (!authPrompt) return;
    const { sessionId } = authPrompt;
    setAuthPrompt(null);
    failSession(sessionId, "Connection canceled by user");
  }, [authPrompt, failSession]);

  const submitAuth = React.useCallback(
    async (value, savePassphrase = false) => {
      if (!authPrompt) return;
      const { sessionId, type } = authPrompt;

      if (!value?.trim()) {
        failSession(sessionId, "Connection error: credentials are required");
        setAuthPrompt(null);
        return;
      }

      setAuthPrompt(null);

      if (savePassphrase) {
        const runtime = runtimesRef.current.get(sessionId);
        if (runtime) {
          runtime.pendingCredentialSave = {
            type,
            value,
            hostId: runtime.host.id,
            keyId: runtime.host.key_id ?? null,
          };
        }
      }

      await connectSession(
        sessionId,
        type === "password" ? { password: value } : { passphrase: value },
      );
    },
    [authPrompt, connectSession, failSession],
  );

  React.useEffect(() => {
    if (!unlocked) {
      disposeRuntimes();
      return;
    }

    if (restoredRef.current || runtimesRef.current.size > 0) return;

    const saved = loadPersistedState();
    if (!saved?.sessions?.length) return;

    const restoredSessions = saved.sessions.map((s) => {
      const scrollback =
        saved.buffers?.[s.id] ?? getSessionLog(s.id)?.log ?? "";
      registerRuntime(
        s.id,
        s.host,
        {
          title: s.title,
          status: "disconnected",
          stage: "restored",
          stageMessage: "Restoring session...",
        },
        scrollback,
        false,
        false,
      );
      if (s.wasConnected) {
        connectQueueRef.current.add(s.id);
      }
      return {
        id: s.id,
        host: s.host,
        title: s.title,
        status: s.wasConnected ? "connecting" : "disconnected",
        stage: "restored",
        stageMessage: s.wasConnected
          ? "Reconnecting..."
          : "Session restored — click Reconnect to continue",
        authType: null,
      };
    });

    setSessions(restoredSessions);
    restoredRef.current = true;
    if (saved.activeId) {
      setActiveId(saved.activeId);
    }
  }, [unlocked, disposeRuntimes, registerRuntime]);

  React.useEffect(() => {
    if (!unlocked) return;
    if (sessions.length === 0) {
      if (hadSessionsRef.current) {
        clearPersistedState();
        hadSessionsRef.current = false;
      }
      return;
    }
    schedulePersist(false);
    return () => clearTimeout(persistTimerRef.current);
  }, [sessions, activeId, unlocked, schedulePersist]);

  React.useEffect(() => {
    if (!unlocked) return;
    const persist = () => persistNow(true);
    const disconnect = () => {
      for (const id of runtimesRef.current.keys()) {
        invoke("ssh_disconnect", { sessionId: id }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", persist);
    window.addEventListener("beforeunload", disconnect);
    return () => {
      window.removeEventListener("beforeunload", persist);
      window.removeEventListener("beforeunload", disconnect);
    };
  }, [unlocked, persistNow]);

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      for (const runtime of runtimesRef.current.values()) {
        runtime.term.options.theme = getXtermTheme();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const value = React.useMemo(
    () => ({
      sessions,
      activeId,
      openSession,
      setActive,
      closeSession,
      reconnect,
      closeAll,
      attachTerminal,
      refreshTerminal,
      authPrompt,
      submitAuth,
      cancelAuth,
    }),
    [
      sessions,
      activeId,
      openSession,
      setActive,
      closeSession,
      reconnect,
      closeAll,
      attachTerminal,
      refreshTerminal,
      authPrompt,
      submitAuth,
      cancelAuth,
    ],
  );

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}
