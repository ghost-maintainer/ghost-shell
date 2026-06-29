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
  AlertTriangle,
  CloudOff,
} from "lucide-react";

export default function PasswordUpdate() {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState("");
  const [error, setError] = React.useState("");

  const loadConfig = React.useCallback(() => {
    invoke("get_cloud_status")
      .then((cfg) => {
        if (cfg) {
          setIsOnline(Boolean(cfg.session_token && !cfg.is_offline));
        }
      })
      .catch((err) => console.error("Failed to load cloud status:", err));
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword.trim()) {
      setError("Current password is required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setSuccess("");
    setError("");
    try {
      await invoke("supabase_update_password", {
        newPassword,
        currentPassword,
      });
      setSuccess("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full flex items-start justify-center gap-6 min-h-0">
        <div className="space-y-4 mx-auto max-w-xl w-full">
          <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-3 border-b pb-4 w-full">
              <div className="size-10 bg-primary/20 rounded-md flex items-center justify-center shrink-0 border border-primary/30">
                <Key className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-semibold text-foreground leading-none">
                  Password Update
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Change your cloud sync account login password.
                </p>
              </div>
            </div>

            {!isOnline ? (
              <div className="w-full space-y-4 py-2">
                <div className="flex flex-col gap-2 bg-muted p-4 rounded-lg text-left">
                  <div className="flex items-center gap-2 text-primary">
                    <CloudOff className="size-5 shrink-0" />
                    <span className="text-sm font-semibold">Currently offline</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground mt-1">
                    Sign in to your cloud account before updating your login
                    password.
                  </p>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => navigate("/dashboard/login")}
                >
                  Go to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleUpdatePassword} className="w-full space-y-4 py-2 text-left">
                {success && (
                  <div className="p-4 rounded-lg flex items-start gap-3 text-xs leading-relaxed border bg-primary/10 border-primary/20 text-primary-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                    <span>{success}</span>
                  </div>
                )}

                {error && (
                  <div className="p-4 rounded-lg flex items-start gap-3 text-xs leading-relaxed border bg-destructive/10 border-destructive/20 text-destructive">
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="current-pass" className="text-xs">
                    Current Password
                  </Label>
                  <Input
                    id="current-pass"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-9 text-xs"
                    disabled={loading}
                  />
                </div>

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
                    disabled={loading}
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
                    disabled={loading}
                  />
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
                    {loading ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
