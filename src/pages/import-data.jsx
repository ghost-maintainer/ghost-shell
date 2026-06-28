import React from "react";
import DashboardLayout from "@/layouts/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  UploadIcon,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  KeyRound,
  Loader2,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

export default function ImportData() {
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [fileBytes, setFileBytes] = React.useState(null);
  const [passphrase, setPassphrase] = React.useState("");
  const [showPassphrase, setShowPassphrase] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState(null);

  const fileInputRef = React.useRef(null);

  const processFile = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setStatus(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      setFileBytes(new Uint8Array(buffer));
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    processFile(file);
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    setSelectedFile(null);
    setFileBytes(null);
    setStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!fileBytes) {
      setStatus({ type: "error", message: "Please select a backup file first." });
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const res = await invoke("import_vault", {
        bytes: Array.from(fileBytes),
        passphrase: passphrase.trim() || null,
      });
      setStatus({
        type: "success",
        message: res,
      });
      setSelectedFile(null);
      setFileBytes(null);
      setPassphrase("");
    } catch (err) {
      setStatus({
        type: "error",
        message:
          typeof err === "string"
            ? err
            : err?.message ||
              "Failed to import backup. Check the backup passphrase and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto mt-8 space-y-6">
        <div className="border bg-sidebar rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="size-10 bg-primary/20 rounded-md flex items-center justify-center shrink-0 border border-primary/30">
              <UploadIcon className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground leading-none">
                Import Secure Vault
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Restore keys and host connections from a backup file.
              </p>
            </div>
          </div>

          <div className="border border-muted-foreground/20 rounded-xl p-8 bg-muted/20 flex flex-col items-center justify-center gap-4 text-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".enc"
              className="hidden"
            />

            <div className="size-12 bg-background border rounded-lg flex items-center justify-center shadow-sm">
              <FileUp className="size-6 text-muted-foreground" />
            </div>

            <div className="space-y-1">
              {selectedFile ? (
                <>
                  <p className="text-sm font-semibold text-primary leading-none">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground leading-none">
                    Select your backup database file
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Only accepts secure encrypted backup files (`.enc`).
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant={selectedFile ? "outline" : "default"}
                size="sm"
                onClick={triggerBrowse}
                disabled={loading}
              >
                {selectedFile ? "Change File" : "Choose File"}
              </Button>
              {selectedFile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  disabled={loading}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-2 bg-muted p-4 rounded-lg">
              <div className="flex items-center gap-2 text-primary">
                <KeyRound className="size-5 shrink-0" />
                <span className="text-sm font-semibold">Backup passphrase</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Enter the master passphrase from when this backup was exported.
                Required if you reset credentials since then — even if your
                current passphrase is the same, the vault key changes after a
                reset.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-passphrase">Passphrase used for this backup</Label>
              <div className="relative">
                <Input
                  id="import-passphrase"
                  type={showPassphrase ? "text" : "password"}
                  placeholder="Enter backup passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  disabled={loading}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPassphrase((v) => !v)}
                  disabled={loading}
                >
                  {showPassphrase ? (
                    <EyeOffIcon className="size-3.5" />
                  ) : (
                    <EyeIcon className="size-3.5" />
                  )}
                </Button>
              </div>
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
              onClick={handleImport}
              disabled={loading || !selectedFile}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin size-4 mr-2" />
                  Importing...
                </>
              ) : (
                "Start Import"
              )}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
