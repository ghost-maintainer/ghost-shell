import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotateCcw, LockIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useSecurity } from "@/provider/security-provider";

export default function KeychainUnlockScreen() {
  const { retryAutoUnlock, unlock, wipeData } = useSecurity();
  const [retrying, setRetrying] = React.useState(true);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [passphrase, setPassphrase] = React.useState("");
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function attempt() {
      setRetrying(true);
      const ok = await retryAutoUnlock();
      if (!cancelled) setRetrying(false);
      if (ok) return;
    }

    attempt();
    return () => {
      cancelled = true;
    };
  }, [retryAutoUnlock]);

  const handleRecover = async (e) => {
    e?.preventDefault();
    if (!passphrase) {
      setError("Passphrase is required.");
      return;
    }
    setError("");
    setUnlocking(true);
    try {
      const ok = await unlock(passphrase);
      if (!ok) setError("Invalid passphrase.");
    } catch (err) {
      setError(typeof err === "string" ? err : err?.message || "Unlock failed.");
    } finally {
      setUnlocking(false);
    }
  };

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
          Unlocking secure session...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center justify-center h-svh bg-background space-y-4 px-6">
        <div className="text-center space-y-1 max-w-md">
          <p className="text-lg font-medium">Restore secure session</p>
          <p className="text-sm text-muted-foreground">
            Enter your master passphrase once to restore access. Ghost Shell
            will save it again for automatic unlock on next start.
          </p>
        </div>

        <form
          onSubmit={handleRecover}
          className="w-full max-w-sm space-y-3 bg-sidebar p-4 rounded-lg border"
        >
          <div className="space-y-2">
            <Label htmlFor="recover-passphrase">Master passphrase</Label>
            <div className="relative">
              <Input
                id="recover-passphrase"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={unlocking || resetting}
                autoFocus
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassphrase((v) => !v)}
              >
                {showPassphrase ? (
                  <EyeOffIcon className="size-3.5" />
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={unlocking || resetting}
          >
            <LockIcon className="size-4 mr-2" />
            {unlocking ? "Restoring..." : "Restore session"}
          </Button>
        </form>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-destructive"
          onClick={() => setShowResetConfirm(true)}
          disabled={unlocking || resetting}
        >
          <RotateCcw className="size-3 mr-1.5" />
          Reset everything and start over
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
              new. All saved hosts, SSH keys, session logs, and vault data will be
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
