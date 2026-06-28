import { createContext, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocation, useNavigate } from "react-router-dom";

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
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    async function checkLockStatus() {
      try {
        const isUnlocked = await invoke("is_unlocked");
        setUnlocked(isUnlocked);
        if (!isUnlocked && location.pathname !== "/dashboard/login") {
          navigate("/dashboard/login");
        }
      } catch (err) {
        console.error("Failed to check lock status:", err);
      } finally {
        setLoading(false);
      }
    }
    checkLockStatus();
  }, [location.pathname, navigate]);

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
        <p className="text-sm text-muted-foreground animate-pulse">Unlocking secure session...</p>
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
