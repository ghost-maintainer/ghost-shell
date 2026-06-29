import React from "react";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@/lib/tauri";
import {
  LockIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shield,
} from "lucide-react";

export default function MasterPassword() {
  const [currentMaster, setCurrentMaster] = React.useState("");
  const [newMaster, setNewMaster] = React.useState("");
  const [confirmMaster, setConfirmMaster] = React.useState("");
  const [masterLoading, setMasterLoading] = React.useState(false);
  const [masterSuccess, setMasterSuccess] = React.useState("");
  const [masterError, setMasterError] = React.useState("");

  const handleUpdateMaster = async (e) => {
    e.preventDefault();
    if (newMaster !== confirmMaster) {
      setMasterError("New passwords do not match.");
      return;
    }
    setMasterLoading(true);
    setMasterSuccess("");
    setMasterError("");
    try {
      await invoke("change_master_password", {
        oldPassphrase: currentMaster,
        newPassphrase: newMaster,
      });
      setMasterSuccess("Master password successfully changed. All local credentials and keys have been re-encrypted.");
      setCurrentMaster("");
      setNewMaster("");
      setConfirmMaster("");
    } catch (err) {
      setMasterError(String(err));
    } finally {
      setMasterLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col gap-6 min-h-0 max-w-xl">
        <div>
          <h2 className="text-xl font-bold">Local Master Password</h2>
          <p className="text-xs text-muted-foreground">
            Update local vault derivation key and re-encrypt files.
          </p>
        </div>

        <div className="border rounded-xl p-5 bg-sidebar space-y-5 shadow-sm">
          <div className="flex items-start gap-2 text-[11px] text-orange-600 dark:text-orange-400 bg-orange-500/10 border border-orange-500/20 p-3 rounded-md leading-relaxed">
            <Shield className="size-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Security Warning:</span> This re-encrypts all local host records, SSH private keys, and keychain files.
            </div>
          </div>

          <form onSubmit={handleUpdateMaster} className="space-y-4">
            {masterSuccess && (
              <div className="flex items-start gap-2 text-xs text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 p-3 rounded-md">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <span>{masterSuccess}</span>
              </div>
            )}

            {masterError && (
              <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-md">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{masterError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="current-master" className="text-xs">
                Current Master Password
              </Label>
              <Input
                id="current-master"
                type="password"
                required
                value={currentMaster}
                onChange={(e) => setCurrentMaster(e.target.value)}
                placeholder="••••••••"
                className="h-9 text-xs"
                disabled={masterLoading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-master" className="text-xs">
                New Master Password
              </Label>
              <Input
                id="new-master"
                type="password"
                required
                value={newMaster}
                onChange={(e) => setNewMaster(e.target.value)}
                placeholder="••••••••"
                className="h-9 text-xs"
                disabled={masterLoading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-master" className="text-xs">
                Confirm New Master Password
              </Label>
              <Input
                id="confirm-master"
                type="password"
                required
                value={confirmMaster}
                onChange={(e) => setConfirmMaster(e.target.value)}
                placeholder="••••••••"
                className="h-9 text-xs"
                disabled={masterLoading}
              />
            </div>

            <Button type="submit" size="sm" className="h-8 text-xs cursor-pointer w-full" disabled={masterLoading}>
              {masterLoading && <Loader2 className="size-3 mr-2 animate-spin" />}
              Change Master Password
            </Button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
