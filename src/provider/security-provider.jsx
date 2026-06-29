import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { clearSessionHistory, pruneExpiredSessions, triggerLogSync } from "@/lib/session-history";

const SecurityContext = createContext({
  unlocked: false,
  loading: true,
  needsSetup: false,
  keychainFailed: false,
  unlock: async () => false,
  lock: async () => {},
  wipeData: async () => {},
  retryAutoUnlock: async () => false,
});

export function SecurityProvider({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [keychainFailed, setKeychainFailed] = useState(false);
  const navigate = useNavigate();

  const retryAutoUnlock = useCallback(async () => {
    try {
      const ok = await invoke("try_auto_unlock");
      if (ok) {
        setUnlocked(true);
        setKeychainFailed(false);
        triggerLogSync().catch(() => {});
      } else {
        setUnlocked(false);
        setKeychainFailed(true);
      }
      return ok;
    } catch (err) {
      console.error("Auto unlock failed:", err);
      setUnlocked(false);
      setKeychainFailed(true);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        pruneExpiredSessions();
        const vaultExists = await invoke("vault_exists");
        if (cancelled) return;

        if (!vaultExists) {
          setNeedsSetup(true);
          setUnlocked(false);
          setKeychainFailed(false);
          navigate("/dashboard/login", { replace: true });
          return;
        }

        setNeedsSetup(false);
        const autoUnlocked = await invoke("try_auto_unlock");
        if (cancelled) return;

        if (autoUnlocked) {
          setUnlocked(true);
          setKeychainFailed(false);
          triggerLogSync().catch(() => {});
        } else {
          setUnlocked(false);
          setKeychainFailed(true);
        }
      } catch (err) {
        console.error("Failed to restore secure session:", err);
        setKeychainFailed(true);
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
        setNeedsSetup(false);
        setUnlocked(true);
        setKeychainFailed(false);
        triggerLogSync().catch(() => {});
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
      await retryAutoUnlock();
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
      setNeedsSetup(true);
      setKeychainFailed(false);
      navigate("/dashboard/login", { replace: true });
    } catch (err) {
      console.error("Wipe failed:", err);
      throw err;
    }
  };

  const value = {
    unlocked,
    loading,
    needsSetup,
    keychainFailed,
    unlock,
    lock,
    wipeData,
    retryAutoUnlock,
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
