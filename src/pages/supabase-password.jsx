import React from "react";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { invoke } from "@/lib/tauri";
import {
  Key,
  Loader2,
  CheckCircle2,
  AlertCircle,
  CloudLightning,
} from "lucide-react";

export default function SupabasePassword() {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = React.useState(false);
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passLoading, setPassLoading] = React.useState(false);
  const [passSuccess, setPassSuccess] = React.useState("");
  const [passError, setPassError] = React.useState("");

  const loadConfig = React.useCallback(() => {
    invoke("get_cloud_status")
      .then((cfg) => {
        if (cfg) {
          setIsOnline(Boolean(cfg.session_token && !cfg.is_offline));
        }
      })
      .catch((err) => console.error("Failed to load settings config:", err));
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPassError("Passwords do not match.");
      return;
    }
    setPassLoading(true);
    setPassSuccess("");
    setPassError("");
    try {
      await invoke("supabase_update_password", { newPassword });
      setPassSuccess("Supabase password updated successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPassError(String(err));
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col gap-6 min-h-0 max-w-xl">
        <div>
          <h2 className="text-xl font-bold">Supabase Account Password</h2>
          <p className="text-xs text-muted-foreground">
            Update your cloud authorization login password.
          </p>
        </div>

        <div className="border rounded-xl p-5 bg-sidebar space-y-5 shadow-sm">
          {!isOnline ? (
            <div className="rounded-lg p-5 bg-muted/20 flex flex-col items-center justify-center text-center gap-3">
              <CloudLightning className="size-8 text-yellow-500 opacity-80 animate-pulse" />
              <div className="space-y-1">
                <p className="text-xs font-semibold">Currently Offline</p>
                <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                  You are in offline mode. Please sign in to synchronize and enable account settings.
                </p>
              </div>
              <Button
                size="sm"
                className="text-xs font-medium cursor-pointer h-8 mt-1"
                onClick={() => navigate("/dashboard/login")}
              >
                Go to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {passSuccess && (
                <div className="flex items-start gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 p-3 rounded-md">
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  <span>{passSuccess}</span>
                </div>
              )}

              {passError && (
                <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-md">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{passError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="new-pass" className="text-xs">
                  New Password
                </Label>
                <Input
                  id="new-pass"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 text-xs"
                  disabled={passLoading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-xs">
                  Confirm New Password
                </Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-9 text-xs"
                  disabled={passLoading}
                />
              </div>

              <Button type="submit" size="sm" className="h-8 text-xs cursor-pointer w-full" disabled={passLoading}>
                {passLoading && <Loader2 className="size-3 mr-2 animate-spin" />}
                Update Supabase Password
              </Button>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
