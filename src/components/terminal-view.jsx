import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTerminals } from "@/hooks/use-terminals";
import { getSessionLog } from "@/lib/session-history";
import { Loader2, PlugZap, ScrollText, X } from "lucide-react";

const STATUS_COLOR = {
  connecting: "bg-yellow-400",
  connected: "bg-green-500",
  disconnected: "bg-zinc-400",
  error: "bg-red-500",
  "auth-required": "bg-orange-400",
};

function isNetworkError(message) {
  if (!message) return false;
  const msg = message.toLowerCase();
  return (
    msg.includes("network is unreachable") ||
    msg.includes("networkunreachable") ||
    msg.includes("no route to host") ||
    msg.includes("unreachable") ||
    msg.includes("dns") ||
    msg.includes("os error 51") ||
    msg.includes("os error 65") ||
    msg.includes("temporary failure in name resolution")
  );
}

export default function TerminalView() {
  const {
    sessions,
    activeId,
    attachTerminal,
    refreshTerminal,
    reconnect,
    closeSession,
    authPrompt,
    submitAuth,
    cancelAuth,
    findInTerminal,
    focusTerminal,
    checkConnectionAlive,
  } = useTerminals();

  const [overlayRect, setOverlayRect] = React.useState(null);
  const [authValue, setAuthValue] = React.useState("");
  const [savePassphrase, setSavePassphrase] = React.useState(false);
  const mountRefs = React.useRef(new Map());

  const [showSearch, setShowSearch] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef(null);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  React.useEffect(() => {
    const handleToggleSearch = (e) => {
      const { sessionId } = e.detail;
      if (sessionId === activeId) {
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener("toggle-terminal-search", handleToggleSearch);
    return () => {
      window.removeEventListener("toggle-terminal-search", handleToggleSearch);
    };
  }, [activeId]);

  React.useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [showSearch]);

  const handleCloseSearch = () => {
    setShowSearch(false);
    if (activeId) {
      focusTerminal(activeId);
    }
  };

  React.useEffect(() => {
    if (!authPrompt) {
      setAuthValue("");
      setSavePassphrase(false);
    }
  }, [authPrompt]);

  const activeSession = sessions.find((s) => s.id === activeId);
  const overlayVisible = Boolean(activeId && overlayRect);
  const showReconnectOverlay =
    activeSession &&
    (activeSession.status === "disconnected" ||
      activeSession.status === "error" ||
      activeSession.status === "restored");
  const isOfflineMode =
    !isOnline ||
    (activeSession?.status === "disconnected" &&
      activeSession?.stageMessage &&
      isNetworkError(activeSession.stageMessage));

  React.useEffect(() => {
    if (sessions.length === 0) return;

    const update = () => {
      const content = document.getElementById("app-content");
      if (!content) return;
      const rect = content.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setOverlayRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    update();
    const content = document.getElementById("app-content");
    const ro = content ? new ResizeObserver(update) : null;
    if (content && ro) ro.observe(content);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [sessions.length, activeId]);

  React.useEffect(() => {
    if (!activeId || !overlayRect) return;

    const attach = () => {
      const el = mountRefs.current.get(activeId);
      if (!el) return;
      attachTerminal(activeId, el);
      refreshTerminal(activeId);
    };

    attach();
    const raf = requestAnimationFrame(() => {
      attach();
      requestAnimationFrame(attach);
    });
    const timer = setTimeout(attach, 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [activeId, overlayRect, attachTerminal, refreshTerminal]);

  if (sessions.length === 0 || !overlayRect) return null;

  return (
    <>
      <div
        className="fixed z-40 flex flex-col bg-background terminal-surface overflow-hidden"
        style={{
          top: overlayRect.top,
          left: overlayRect.left,
          width: overlayRect.width,
          height: overlayRect.height,
          visibility: overlayVisible ? "visible" : "hidden",
          pointerEvents: overlayVisible ? "auto" : "none",
        }}
        aria-hidden={!overlayVisible}
      >
        <div className="h-9 shrink-0 border-b bg-muted/80 px-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`size-2 rounded-full shrink-0 ${STATUS_COLOR[activeSession?.status] ?? "bg-zinc-400"}`}
            />
            <span className="text-xs font-medium truncate">
              {activeSession?.title}
            </span>
            <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
              {activeSession?.stageMessage}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">

            <Button
              size="icon-xs"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => closeSession(activeId)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 min-w-0 bg-background terminal-surface">
          {sessions.map((session) => (
            <div
              key={session.id}
              ref={(el) => {
                if (el) mountRefs.current.set(session.id, el);
                else mountRefs.current.delete(session.id);
              }}
              onFocus={() => checkConnectionAlive(session.id)}
              onClick={() => checkConnectionAlive(session.id)}
              className="absolute inset-0 min-h-0 min-w-0 terminal-surface"
              style={{
                zIndex: session.id === activeId ? 2 : 1,
                opacity: session.id === activeId ? 1 : 0,
                pointerEvents: session.id === activeId ? "auto" : "none",
              }}
            />
          ))}

          {isOfflineMode && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
              <div className="flex flex-col items-center gap-4 text-center max-w-sm p-6 bg-sidebar rounded-xl border border-destructive/20 shadow-2xl">
                <div className="size-12 rounded-full bg-destructive/15 flex items-center justify-center border border-destructive/30">
                  <PlugZap className="size-6 text-destructive animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">Internet Disconnected</h3>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Please check your network settings. Reconnecting automatically once internet is restored.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isOfflineMode && showReconnectOverlay && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="flex flex-col items-center gap-4 text-center max-w-sm p-6 bg-sidebar rounded-xl border border-border shadow-2xl">
                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <PlugZap className="size-6 text-primary" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">Session Disconnected</h3>
                  <p className="text-xs text-muted-foreground leading-normal px-2">
                    {activeSession?.stageMessage || "The connection to the host was lost."}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="cursor-pointer font-medium mt-1 w-full"
                  onClick={() => reconnect(activeId)}
                >
                  Connect
                </Button>
              </div>
            </div>
          )}

          {activeSession?.status === "connecting" && (
            <div className="absolute inset-0 pointer-events-none flex items-start justify-end p-3 z-10">
              <div className="flex items-center gap-2 rounded-md bg-background/80 border px-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Connecting...
              </div>
            </div>
          )}

          {showSearch && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2 rounded-lg border bg-background/95 backdrop-blur-md px-3 py-1.5 shadow-lg max-w-xs animate-in fade-in slide-in-from-top-2 duration-150 border-primary/20">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Find in terminal..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  findInTerminal(activeId, e.target.value, "next");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (e.shiftKey) {
                      findInTerminal(activeId, searchQuery, "prev");
                    } else {
                      findInTerminal(activeId, searchQuery, "next");
                    }
                  } else if (e.key === "Escape") {
                    handleCloseSearch();
                  }
                }}
                className="bg-transparent border-none text-xs outline-none text-foreground w-36 placeholder:text-muted-foreground/60"
              />
              <div className="flex items-center gap-0.5 border-l pl-2 border-muted dark:border-muted/50">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="h-5 w-5 rounded-md text-muted-foreground hover:text-foreground"
                  onClick={() => findInTerminal(activeId, searchQuery, "prev")}
                >
                  <span className="sr-only">Previous</span>
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="h-5 w-5 rounded-md text-muted-foreground hover:text-foreground"
                  onClick={() => findInTerminal(activeId, searchQuery, "next")}
                >
                  <span className="sr-only">Next</span>
                  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="h-5 w-5 rounded-md ml-1 text-muted-foreground hover:text-foreground"
                  onClick={handleCloseSearch}
                >
                  <X className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {authPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg space-y-4 m-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                {authPrompt.type === "password"
                  ? "Enter password"
                  : "Enter key passphrase"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Credentials are required to connect to this host.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ssh-auth-input">
                {authPrompt.type === "password" ? "Password" : "Passphrase"}
              </Label>
              <Input
                id="ssh-auth-input"
                type="password"
                autoFocus
                value={authValue}
                onChange={(e) => setAuthValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (!authValue.trim()) {
                      submitAuth("", savePassphrase);
                      return;
                    }
                    submitAuth(authValue, savePassphrase);
                  }
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor="save-passphrase"
                className="text-xs font-normal text-muted-foreground cursor-pointer"
              >
                Save passphrase
              </Label>
              <Switch
                id="save-passphrase"
                checked={savePassphrase}
                onCheckedChange={setSavePassphrase}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  cancelAuth();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  submitAuth(authValue, savePassphrase);
                }}
              >
                Connect
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
