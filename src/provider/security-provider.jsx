import { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocation, useNavigate } from "react-router-dom";
import { clearSessionHistory, pruneExpiredSessions } from "@/lib/session-history";

const SecurityContext = createContext({
  unlocked: false,
  loading: true,
  unlock: async () => false,
  lock: async () => {},
  wipeData: async () => {},
});

export function SecurityProvider({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const wasOnLogin = location.pathname === "/dashboard/login";
    let cancelled = false;

    async function bootstrap() {
      try {
        pruneExpiredSessions();
        const autoUnlocked = await invoke("try_auto_unlock");
        if (cancelled) return;

        if (autoUnlocked) {
          setUnlocked(true);
          if (wasOnLogin) {
            navigate("/dashboard/hosts", { replace: true });
          }
        }
      } catch (err) {
        console.error("Failed to restore secure session:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unlock = async (passphrase) => {
    try {
      const success = await invoke("unlock", { passphrase });
      if (success) {
        setUnlocked(true);
        navigate("/dashboard/hosts");
        return true;
      }
      return false;
    } catch (err) {
      console.error("Unlock failed:", err);
      throw err;
    }
  };

  const lock = async () => {
    try {
      await invoke("lock");
      setUnlocked(false);
      navigate("/dashboard/login");
    } catch (err) {
      console.error("Lock failed:", err);
    }
  };

  const wipeData = async () => {
    try {
      await invoke("wipe_data");
      clearSessionHistory();
      sessionStorage.removeItem("ghost-shell-terminal-sessions");
      setUnlocked(false);
      navigate("/dashboard/login");
    } catch (err) {
      console.error("Wipe failed:", err);
    }
  };

  const value = {
    unlocked,
    loading,
    unlock,
    lock,
    wipeData,
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-svh bg-background space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground animate-pulse">
          Starting secure session...
        </p>
      </div>
    );
  }

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
}

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error("useSecurity must be used within a SecurityProvider");
  }
  return context;
};
