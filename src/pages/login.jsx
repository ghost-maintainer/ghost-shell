import logo from "@/assets/app-icon.png";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { invoke } from "@tauri-apps/api/core";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import React from "react";
import { useSecurity } from "../provider/security-provider";

export default function Login() {
  const [passphrase, setPassphrase] = React.useState("");
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  const [isFirstSetup, setIsFirstSetup] = React.useState(null);

  const { unlock } = useSecurity();

  React.useEffect(() => {
    invoke("vault_exists")
      .then((exists) => setIsFirstSetup(!exists))
      .catch(() => setIsFirstSetup(false));
  }, []);

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

  const title = isFirstSetup
    ? "Create your master passphrase"
    : "Enter your passphrase";
  const subtitle = isFirstSetup
    ? "This is only required once. Ghost Shell will remember it securely using your system keychain."
    : "Your session was locked. Enter your passphrase to continue.";

  return (
    <div
      className="flex flex-col items-center justify-center h-svh space-y-3"
      data-tauri-drag-region
    >
      <img src={logo} alt="logo" className="size-18" data-tauri-drag-region />
      <div className="text-center space-y-1">
        <p className="text-lg text-foreground leading-none">{title}</p>
        <p className="text-xs text-muted-foreground leading-none max-w-sm">
          {subtitle}
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
            autoFocus
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
            {isLoggingIn
              ? "Verifying..."
              : isFirstSetup
                ? "Create & Continue"
                : "Unlock"}
          </Button>
        </div>
      </form>
    </div>
  );
}
