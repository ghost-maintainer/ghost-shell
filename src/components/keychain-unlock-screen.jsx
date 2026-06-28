import React from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useSecurity } from "@/provider/security-provider";

export default function KeychainUnlockScreen() {
  const { retryAutoUnlock, wipeData } = useSecurity();
  const [retrying, setRetrying] = React.useState(true);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function attempt() {
      setRetrying(true);
      await retryAutoUnlock();
      if (!cancelled) setRetrying(false);
    }

    attempt();
    return () => {
      cancelled = true;
    };
  }, [retryAutoUnlock]);

  const handleReset = async () => {
    setShowResetConfirm(false);
    setResetting(true);
    try {
      await wipeData();
    } catch (err) {
      console.error("Reset failed:", err);
    } finally {
      setResetting(false);
    }
  };

  if (retrying) {
    return (
      <div className="flex flex-col items-center justify-center h-svh bg-background space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-sm text-muted-foreground animate-pulse">
          Unlocking from system keychain...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center h-svh bg-background space-y-4 px-6 text-center">
        <p className="text-lg font-medium">Could not unlock automatically</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Your vault exists but Ghost Shell could not read credentials from the
          system keychain. Reset everything to set up again from scratch.
        </p>
        <Button
          variant="destructive"
          onClick={() => setShowResetConfirm(true)}
          disabled={resetting}
        >
          <RotateCcw className="size-4 mr-2" />
          Reset credentials
        </Button>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="border bg-sidebar p-6 rounded-xl max-w-md w-full shadow-lg space-y-4 m-4">
            <h3 className="text-lg font-bold text-destructive">
              Reset all credentials?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This will permanently wipe everything and set up Ghost Shell as
              new. All saved hosts, SSH keys, session logs, terminal history,
              encrypted vault data, and stored keychain credentials will be
              deleted. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={resetting}
                onClick={handleReset}
              >
                {resetting ? "Resetting..." : "Reset everything"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
