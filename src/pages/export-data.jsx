import React from "react";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import {
  DownloadIcon,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export default function ExportData() {
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState(null); // { type: 'success' | 'error', message: string }

  const handleExport = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const path = await invoke("export_vault");
      setStatus({
        type: "success",
        message: `Backup exported successfully to:\n${path}`,
      });
    } catch (err) {
      setStatus({
        type: "error",
        message:
          typeof err === "string"
            ? err
            : err?.message || "Failed to export data.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="h-full flex items-start justify-center gap-6 min-h-0">
        <div className="space-y-4 mx-auto max-w-xl">
          <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="size-10 bg-primary/20 rounded-md flex items-center justify-center shrink-0 border border-primary/30">
                <DownloadIcon className="size-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground leading-none">
                  Export Secure Vault
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Save a local backup of your keychain and host configurations.
                </p>
              </div>
            </div>

            <div className="space-y-4 py-2">
              <div className="flex flex-col gap-2 bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 text-primary">
                  <ShieldCheck className="size-5 shrink-0" />
                  <span className="text-sm font-semibold">
                    Automatic Session Encryption
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground mt-1">
                  The exported backup file is always encrypted using the secure
                  key derived from your current login passphrase. No additional
                  passwords are required to export or import this backup file.
                </p>
              </div>
            </div>

            {status && (
              <div
                className={`p-4 rounded-lg flex items-start gap-3 text-xs leading-relaxed border ${
                  status.type === "success"
                    ? "bg-primary/10 border-primary/20 text-primary-foreground"
                    : "bg-destructive/10 border-destructive/20 text-destructive"
                }`}
              >
                {status.type === "success" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                )}
                <span className="whitespace-pre-line">{status.message}</span>
              </div>
            )}

            <div className="pt-2">
              <Button
                className="w-full"
                size="lg"
                onClick={handleExport}
                disabled={loading}
              >
                {loading ? "Exporting..." : "Choose Path & Export"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
