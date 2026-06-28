import logo from "@/assets/app-icon.png";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import React from "react";
import { useSecurity } from "../provider/security-provider";

export default function Login() {
  const [passphrase, setPassphrase] = React.useState("");
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);

  const { unlock } = useSecurity();

  const handleShowPassphrase = () => {
    setShowPassphrase(!showPassphrase);
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!passphrase) {
      setError("Passphrase is required.");
      return;
    }

    setError("");
    setIsLoggingIn(true);

    try {
      const success = await unlock(passphrase);
      if (!success) {
        setError("Invalid passphrase. Please try again.");
      }
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err?.message || "Failed to unlock vault.",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-svh space-y-3"
      data-tauri-drag-region
    >
      <img src={logo} alt="logo" className="size-18" data-tauri-drag-region />
      <div className="text-center space-y-1">
        <p className="text-lg text-foreground leading-none">
          Enter your passphrase to login
        </p>
        <p className="text-xs text-muted-foreground leading-none">
          Key is required to encrypt and decrypt your data.
        </p>
      </div>
      <form
        onSubmit={handleLogin}
        className="flex flex-col items-center justify-center space-y-2 bg-sidebar max-w-sm w-full p-4 rounded-lg"
      >
        <InputGroup>
          <InputGroupAddon>
            <LockIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Enter your passphrase"
            className="w-full"
            type={showPassphrase ? "text" : "password"}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            disabled={isLoggingIn}
          />
          <InputGroupButton
            type="button"
            onClick={handleShowPassphrase}
            disabled={isLoggingIn}
          >
            {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroup>

        {error && (
          <p className="text-xs text-destructive text-left w-full px-1 pt-1">
            {error}
          </p>
        )}

        <div className="px-4 py-2 w-full">
          <Button
            className="w-full"
            size="lg"
            type="submit"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? "Verifying..." : "Login / Setup"}
          </Button>
        </div>
      </form>
    </div>
  );
}