import React from "react";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import { useSecurity } from "../provider/security-provider";
import { Trash2, AlertOctagon } from "lucide-react";

export default function WipeData() {
  const { wipeData } = useSecurity();
  const [showConfirm, setShowConfirm] = React.useState(false);

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto mt-8 space-y-6">
        <div className="border bg-sidebar rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="size-10 bg-destructive/20 rounded-md flex items-center justify-center shrink-0 border border-destructive/30">
              <Trash2 className="size-5 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground leading-none">Wipe All Secure Data</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Permanently delete your local database, encryption settings, keys, and configurations.
              </p>
            </div>
          </div>

          <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg flex items-start gap-3">
            <AlertOctagon className="size-5 text-destructive shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider leading-none">
                Danger Zone
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This operation is absolute and cannot be undone. All encrypted data at rest will be deleted from your disk, and your current session will be closed immediately.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Button
              className="w-full"
              size="lg"
              variant="destructive"
              onClick={() => setShowConfirm(true)}
            >
              Wipe Data
            </Button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="border bg-sidebar p-6 rounded-xl max-w-md w-full shadow-lg space-y-4 m-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-destructive">Wipe All Secure Data?</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you absolutely sure you want to proceed? This will permanently delete all your saved hosts, credentials, public/private keys, and encryption settings. This action is irreversible.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowConfirm(false);
                  wipeData();
                }}
              >
                Wipe Everything
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}