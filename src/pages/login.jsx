import logo from "@/assets/app-icon.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  Globe,
  HelpCircle,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import React from "react";
import { useSecurity } from "../provider/security-provider";
import { invoke } from "@tauri-apps/api/core";

export default function Login() {
  const [step, setStep] = React.useState("sync-choice"); // "sync-choice" | "register" | "passphrase"
  const [hasCloudVault, setHasCloudVault] = React.useState(false);
  const [passphrase, setPassphrase] = React.useState("");
  const [showPassphrase, setShowPassphrase] = React.useState(false);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState("");

  // Email Auth State
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const { unlock } = useSecurity();
  const [showForgotConfirm, setShowForgotConfirm] = React.useState(false);

  const handleForgotPassphraseWipe = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("supabase_wipe_cloud_data").catch((err) => {
        console.warn("Cloud wipe failed or not connected, proceeding to local wipe:", err);
      });
      await invoke("wipe_data");
      setPassphrase("");
      setError("");
      setHasCloudVault(false);
      setStep("sync-choice");
      setShowForgotConfirm(false);
      window.location.reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleShowPassphrase = () => {
    setShowPassphrase(!showPassphrase);
  };

  const handleOfflineMode = async () => {
    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      await invoke("set_offline_mode");
      setHasCloudVault(false);
      setStep("passphrase");
    } catch (err) {
      setError(err?.message || typeof err === "string" ? err : "Failed to set offline mode.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloudLogin = async (provider) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setError("Sorry, but remote login is not available. Please use the offline mode instead.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      const hasCloudData = await invoke("start_supabase_auth", {
        provider,
        url: supabaseUrl.trim(),
        anonKey: supabaseKey.trim(),
      });
      setHasCloudVault(hasCloudData);
      setStep("passphrase");
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err?.message || "Authentication or connection to Supabase failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setError("Remote sync configuration is missing in the .env file.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      const hasCloudData = await invoke("supabase_login_email", {
        url: supabaseUrl.trim(),
        anonKey: supabaseKey.trim(),
        email: email.trim(),
        password,
      });
      setHasCloudVault(hasCloudData);
      setStep("passphrase");
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err?.message || "Login failed. Check credentials and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setError("Sorry, but remote registration is not available. Please use the offline mode instead.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);
    try {
      const signedInImmediately = await invoke("supabase_register_email", {
        url: supabaseUrl.trim(),
        anonKey: supabaseKey.trim(),
        email: email.trim(),
        password,
      });
      
      if (signedInImmediately) {
        setHasCloudVault(false);
        setStep("passphrase");
      } else {
        setSuccessMessage("Registration successful! Please check your email inbox to confirm your account before logging in.");
      }
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err?.message || "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    if (e) e.preventDefault();
    if (!email) {
      setError("Email address is required.");
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      setError("Sorry, but remote password reset is not available. Please use the offline mode instead.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await invoke("supabase_send_reset_password", {
        url: supabaseUrl.trim(),
        anonKey: supabaseKey.trim(),
        email: email.trim(),
      });
      setSuccessMessage("Password reset email sent successfully! Awaiting your click in the email to update your password...");
      
      // Start background listener to automatically intercept the click redirect
      invoke("supabase_await_reset_redirect", {
        url: supabaseUrl.trim(),
        anonKey: supabaseKey.trim(),
      }).then(() => {
        // Redirect succeeded! Switch to set new password form
        setError("");
        setSuccessMessage("");
        setPassword("");
        setConfirmPassword("");
        setLoading(false);
        setStep("reset-password");
      }).catch((err) => {
        setError(typeof err === "string" ? err : err?.message || "Failed to intercept password reset redirect.");
        setLoading(false);
      });

    } catch (err) {
      setError(typeof err === "string" ? err : err?.message || "Failed to send reset link.");
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    if (e) e.preventDefault();
    if (!password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const hasCloudData = await invoke("supabase_update_password", {
        newPassword: password,
      });
      setHasCloudVault(hasCloudData);
      setStep("passphrase");
    } catch (err) {
      setError(typeof err === "string" ? err : err?.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (e) => {
    if (e) e.preventDefault();
    if (!passphrase) {
      setError("Passphrase is required.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const success = await unlock(passphrase);
      if (!success) {
        setError("Could not unlock vault. Please verify your passphrase.");
      }
    } catch (err) {
      setError(
        typeof err === "string"
          ? err
          : err?.message || "Unlock failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-svh space-y-4" data-tauri-drag-region>
      <img src={logo} alt="logo" className="size-16" data-tauri-drag-region />

      {step === "sync-choice" && (
        /* STEP 1: SYNC CHOICE SETUP (EMAIL & OAUTH SIGN IN) */
        <div className="max-w-sm w-full space-y-4 px-4 flex flex-col items-center">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-foreground">Welcome to Ghost Shell</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sign in to enable zero-knowledge cloud sync, or continue offline.
            </p>
          </div>

          <div className="w-full flex flex-col gap-3">
            {/* Google Login Button */}
            <Button
              className="w-full text-xs font-semibold h-9 shadow-sm bg-[#fff] hover:bg-neutral-100 text-neutral-900 border border-neutral-200"
              onClick={() => handleCloudLogin("google")}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin size-4 mr-2" />
              ) : (
                <svg className="size-4 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              Sign In with Google
            </Button>

            {/* GitHub Login Button */}
            <Button
              className="w-full text-xs font-semibold h-9 shadow-sm bg-[#24292e] hover:bg-[#2f363d] text-white"
              onClick={() => handleCloudLogin("github")}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="animate-spin size-4 mr-2" />
              ) : (
                <svg className="size-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                  />
                </svg>
              )}
              Sign In with GitHub
            </Button>

            <div className="relative my-1 w-full flex items-center justify-center">
              <span className="absolute border-t border-border w-full"></span>
              <span className="relative bg-background px-2 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Or
              </span>
            </div>

            {/* Email Form */}
            <form onSubmit={handleEmailSignIn} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-[10px] font-bold text-muted-foreground uppercase">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-9 text-xs"
                  aria-invalid={error && (error.toLowerCase().includes("email") || error.toLowerCase().includes("user") || error.toLowerCase().includes("invalid") || error.toLowerCase().includes("required")) ? "true" : "false"}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-[10px] font-bold text-muted-foreground uppercase">Password</Label>
                  <button
                    type="button"
                    className="text-[10px] text-primary hover:underline font-medium uppercase"
                    onClick={() => {
                      setError("");
                      setSuccessMessage("");
                      setStep("forgot-password");
                    }}
                    disabled={loading}
                  >
                    Forgot Password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-9 text-xs"
                  aria-invalid={error && (error.toLowerCase().includes("password") || error.toLowerCase().includes("credential") || error.toLowerCase().includes("invalid") || error.toLowerCase().includes("required")) ? "true" : "false"}
                />
              </div>

              <Button type="submit" className="w-full text-xs font-semibold h-9 mt-1" disabled={loading}>
                {loading ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
                Sign In
              </Button>
            </form>

            <div className="flex justify-between items-center text-xs pt-1">
              <button
                type="button"
                className="text-primary hover:underline text-left font-medium"
                onClick={() => {
                  setError("");
                  setSuccessMessage("");
                  setStep("register");
                }}
                disabled={loading}
              >
                Create Account
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium"
                onClick={handleOfflineMode}
                disabled={loading}
              >
                <Globe className="size-3.5" /> Continue Offline
              </button>
            </div>

            {error && (
              <div className="p-3 mt-2 bg-destructive/10 border border-destructive/20 rounded-lg text-[11px] text-destructive flex items-start gap-2">
                <HelpCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                <span className="text-left leading-normal">{error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {step === "register" && (
        /* STEP 1.5: EMAIL REGISTRATION PAGE */
        <div className="max-w-sm w-full space-y-4 px-4 flex flex-col items-center">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-foreground">Create Account</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Register for your sync account to start backup syncing.
            </p>
          </div>

          <form onSubmit={handleEmailSignUp} className="w-full space-y-3">
            <div className="space-y-1">
              <Label htmlFor="reg-email" className="text-[10px] font-bold text-muted-foreground uppercase">Email Address</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                aria-invalid={error && (error.toLowerCase().includes("email") || error.toLowerCase().includes("required")) ? "true" : "false"}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="reg-password" className="text-[10px] font-bold text-muted-foreground uppercase">Password</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                aria-invalid={error && (error.toLowerCase().includes("password") || error.toLowerCase().includes("required")) ? "true" : "false"}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="reg-confirm" className="text-[10px] font-bold text-muted-foreground uppercase">Confirm Password</Label>
              <Input
                id="reg-confirm"
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                aria-invalid={error && (error.toLowerCase().includes("confirm") || error.toLowerCase().includes("match") || error.toLowerCase().includes("required")) ? "true" : "false"}
              />
            </div>

            <Button type="submit" className="w-full text-xs font-semibold h-9 mt-2" disabled={loading}>
              {loading ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
              Register Account
            </Button>
          </form>

          <button
            type="button"
            className="flex items-center justify-center gap-1 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
            onClick={() => {
              setError("");
              setSuccessMessage("");
              setStep("sync-choice");
            }}
            disabled={loading}
          >
            <ArrowLeft className="size-3.5" /> Back to Sign In
          </button>

          {error && (
            <div className="w-full p-3 mt-2 bg-destructive/10 border border-destructive/20 rounded-lg text-[11px] text-destructive flex items-start gap-2">
              <HelpCircle className="size-4 shrink-0 text-destructive mt-0.5" />
              <span className="text-left leading-normal">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="w-full p-3 mt-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-[11px] flex items-start gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
              <span className="text-left leading-normal text-emerald-400">{successMessage}</span>
            </div>
          )}
        </div>
      )}

      {step === "forgot-password" && (
        <div className="max-w-sm w-full space-y-4 px-4 flex flex-col items-center">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-foreground">Forgot Password</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter your email address to receive a secure password reset link.
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="w-full space-y-3">
            <div className="space-y-1">
              <Label htmlFor="reset-email" className="text-[10px] font-bold text-muted-foreground uppercase">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                aria-invalid={error && (error.toLowerCase().includes("email") || error.toLowerCase().includes("required")) ? "true" : "false"}
              />
            </div>

            <Button type="submit" className="w-full text-xs font-semibold h-9 mt-2" disabled={loading}>
              {loading && !successMessage ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
              Send Reset Link
            </Button>
          </form>

          <button
            type="button"
            className="flex items-center justify-center gap-1 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
            onClick={() => {
              setError("");
              setSuccessMessage("");
              setStep("sync-choice");
            }}
            disabled={loading}
          >
            <ArrowLeft className="size-3.5" /> Back to Sign In
          </button>

          {error && (
            <div className="w-full p-3 mt-2 bg-destructive/10 border border-destructive/20 rounded-lg text-[11px] text-destructive flex items-start gap-2">
              <HelpCircle className="size-4 shrink-0 text-destructive mt-0.5" />
              <span className="text-left leading-normal">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="w-full p-3 mt-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-[11px] flex items-start gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500 mt-0.5" />
              <span className="text-left leading-normal text-emerald-400">{successMessage}</span>
            </div>
          )}
        </div>
      )}

      {step === "reset-password" && (
        <div className="max-w-sm w-full space-y-4 px-4 flex flex-col items-center">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-foreground">Set New Password</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your recovery link was successfully verified. Set a new password for your account.
            </p>
          </div>

          <form onSubmit={handleUpdatePassword} className="w-full space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-[10px] font-bold text-muted-foreground uppercase">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                aria-invalid={error && (error.toLowerCase().includes("password") || error.toLowerCase().includes("required")) ? "true" : "false"}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm-new-password" className="text-[10px] font-bold text-muted-foreground uppercase">Confirm New Password</Label>
              <Input
                id="confirm-new-password"
                type="password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                className="h-9 text-xs"
                aria-invalid={error && (error.toLowerCase().includes("confirm") || error.toLowerCase().includes("match") || error.toLowerCase().includes("required")) ? "true" : "false"}
              />
            </div>

            <Button type="submit" className="w-full text-xs font-semibold h-9 mt-2" disabled={loading}>
              {loading ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
              Update Password
            </Button>
          </form>

          {error && (
            <div className="w-full p-3 mt-2 bg-destructive/10 border border-destructive/20 rounded-lg text-[11px] text-destructive flex items-start gap-2">
              <HelpCircle className="size-4 shrink-0 text-destructive mt-0.5" />
              <span className="text-left leading-normal">{error}</span>
            </div>
          )}
        </div>
      )}

      {step === "passphrase" && (
        /* STEP 2: MASTER PASSPHRASE ENTRY */
        <div className="max-w-sm w-full space-y-4 px-4 flex flex-col items-center">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-foreground">
              {hasCloudVault ? "Restore Cloud Vault" : "Create Master Passphrase"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {hasCloudVault
                ? "We detected an existing encrypted vault on Supabase. Enter your master passcode to decrypt and sync it."
                : "This passcode will be used to encrypt your vault file locally and on the cloud. Do not forget it."}
            </p>
          </div>

          <form
            onSubmit={handleUnlock}
            className="w-full flex flex-col gap-3"
          >
            {hasCloudVault && (
              <div className="w-full flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-lg text-xs leading-normal">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                <span>Cloud backup loaded successfully. Ready to decrypt.</span>
              </div>
            )}

            <InputGroup>
              <InputGroupAddon>
                <LockIcon className="size-4 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Enter your master passcode"
                className="w-full text-xs h-10"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={loading}
                autoFocus
                aria-invalid={error ? "true" : "false"}
              />
              <InputGroupButton
                type="button"
                onClick={handleShowPassphrase}
                disabled={loading}
              >
                {showPassphrase ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </InputGroupButton>
            </InputGroup>

            <Button className="w-full text-xs font-semibold h-10 mt-1" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin size-3.5 mr-1.5" />
                  Unlocking...
                </>
              ) : hasCloudVault ? (
                "Decrypt & Sync Cloud"
              ) : (
                "Create & Continue"
              )}
            </Button>

            {error && (
              <div className="p-3 mt-2 bg-destructive/10 border border-destructive/20 rounded-lg text-[11px] text-destructive flex items-start gap-2">
                <HelpCircle className="size-4 shrink-0 text-destructive mt-0.5" />
                <span className="text-left leading-normal">{error}</span>
              </div>
            )}
          </form>

          <button
            type="button"
            className="text-xs text-destructive hover:underline transition-colors pt-2 block mx-auto cursor-pointer"
            onClick={() => setShowForgotConfirm(true)}
            disabled={loading}
          >
            Forgot Password?
          </button>

          <button
            type="button"
            className="flex items-center justify-center gap-1 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors pt-2"
            onClick={() => setStep("sync-choice")}
            disabled={loading}
          >
            <ArrowLeft className="size-3.5" /> Back to Sync Setup
          </button>
        </div>
      )}

      {showForgotConfirm && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="border bg-sidebar p-6 rounded-xl max-w-md w-full shadow-lg space-y-4 m-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-destructive text-center">
              Wipe and Reset Sync Vault?
            </h3>
            <div className="text-xs text-muted-foreground space-y-3 leading-relaxed">
              <p>
                This is going to clear and wipe all your data in sync. We cannot reset your
                password because we do not store your password in decrypted mode.
              </p>
              <p>
                All your data is encrypted and stored using your password. We cannot decrypt your
                data or update that password.
              </p>
              <p className="font-semibold text-foreground">
                Do you want to continue? This will permanently delete all cloud backup entries for
                your account on Supabase and remove your local database if present.
              </p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                className="text-xs h-9 cursor-pointer"
                onClick={() => setShowForgotConfirm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="text-xs h-9 cursor-pointer"
                onClick={handleForgotPassphraseWipe}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin size-3.5 mr-1.5" /> : null}
                Wipe All Cloud & Local Data
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
