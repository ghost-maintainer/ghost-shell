# Ghost Shell

**A native SSH & SFTP desktop client by [Ghost Compiler](https://github.com/ghost-maintainer/ghost-shell).**

Built with **Tauri 2**, **React 19**, and **Rust** — small, fast, and truly cross-platform.

[Build status](https://github.com/ghost-maintainer/ghost-shell/actions/workflows/build.yml) · [Latest release](https://github.com/ghost-maintainer/ghost-shell/releases/latest) · [License](LICENSE)

---

## Overview

| | |
|---|---|
| **App name** | Ghost Shell |
| **Publisher** | Ghost Compiler |
| **Bundle ID** | `com.ghostcompiler.ghost-shell` |
| **Platforms** | Windows · macOS · Linux |

Ghost Shell is a local-first SSH client. Your hosts, keys, and passwords live in an **encrypted vault** on your machine. The app unlocks once per session (or automatically via OS keychain / session file), then gives you host management, an encrypted keychain, interactive terminal tabs, session logs, and vault import/export.

---

## How the app works

### High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (Vite)                                            │
│  hosts · keychain · terminal · logs · import/export · login │
└───────────────────────────┬─────────────────────────────────┘
                            │ Tauri IPC (invoke + channels)
┌───────────────────────────▼─────────────────────────────────┐
│  Rust backend (src-tauri)                                   │
│  vault · secure_store · ssh · google_drive · supabase       │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   vault.enc          OS keychain         Remote SSH/SFTP
   (AES-256-GCM)      session unlock      (russh)
```

- **Frontend** — React pages under `src/pages/`, shared UI in `src/components/`, global state in `src/provider/`.
- **Backend** — Rust commands in `src-tauri/src/lib.rs`; SSH sessions stream terminal I/O over Tauri channels.
- **Storage** — Encrypted `vault.enc` in the app data directory; optional cloud sync hooks (Google Drive / Supabase).

### Application flow

```mermaid
flowchart TD
  A[App launch] --> B{Vault exists?}
  B -->|No| C[Setup — create master passphrase]
  B -->|Yes| D[try_auto_unlock]
  D -->|Success| E[Dashboard unlocked]
  D -->|Fail| F[Unlock screen — passphrase or reset]
  C --> E
  F -->|Unlock| E
  F -->|Reset| C
  E --> G[Hosts / Keys / Terminal / Logs / Settings]
  G --> H[Open SSH session]
  H --> I{Credentials stored?}
  I -->|Yes| J[Connect]
  I -->|No| K[Auth prompt — password or key passphrase]
  K -->|Save toggle on| L[Store credential in vault after success]
  K --> J
  J --> M[Interactive xterm terminal]
```

#### 1. First launch (setup)

1. No vault file exists → user is sent to **Login / Setup**.
2. User creates a **master passphrase** (minimum strength enforced in UI).
3. Rust derives a key (PBKDF2 + AES-256-GCM) and creates `vault.enc`.
4. Session key is saved to **OS keychain** (with `session.dat` fallback on Windows).

#### 2. Returning launch (unlock)

1. `vault_exists` → `try_auto_unlock` reads keychain / session file.
2. If auto-unlock succeeds → dashboard opens immediately.
3. If it fails → **Keychain unlock screen** (passphrase recovery or wipe).

#### 3. Daily use

| Area | What it does |
|------|----------------|
| **Hosts** | Add/edit/delete servers; optional stored password; assign SSH keys |
| **Keychain** | Generate or import keys; optional passphrase storage |
| **Terminal** | Tabbed SSH sessions (xterm.js); reconnect; session persistence |
| **Logs** | Full session scrollback (7-day retention); reconnect from history |
| **Import / Export** | Encrypted `.enc` vault backup and restore |
| **Settings** | Theme, cloud sync, wipe data |

#### 4. SSH connection flow

1. User opens a host → `TerminalProvider` creates a session tab.
2. Rust loads host + key from vault → `ssh_connect` via **russh**.
3. Status events (`resolve` → `tcp` → `handshake` → `auth` → `pty` → `connected`) stream to the terminal.
4. If credentials are missing → modal prompts for password or key passphrase (optional **Save passphrase** toggle).
5. Keystrokes are batched to Rust; output streams back over a channel.
6. On cancel → session shows **Connection canceled by user**; on bad credentials → **Authentication failed**.

#### 5. Security model

- Master passphrase never stored in plaintext.
- Host passwords and key passphrases stored **inside the encrypted vault**.
- Auto-unlock uses OS keychain (`GhostShell` service) or encrypted session file.
- Production builds disable browser devtools / right-click inspect.
- Vault export uses the same encryption as the live vault (or backup passphrase on import).

---

## Download

### [⬇ Latest release](https://github.com/ghost-maintainer/ghost-shell/releases/latest)

CI builds run on every push; releases are published from `main`, version tags (`v*`), or manual workflow dispatch.

| Platform | Architecture | File |
|----------|--------------|------|
| **Windows** | x64 | `Ghost Shell_<ver>_x64-setup.exe` |
| **Windows** | ARM64 | `Ghost Shell_<ver>_arm64-setup.exe` |
| **Windows** | x64 / ARM64 | `Ghost Shell_<ver>_<arch>.msix` |
| **Windows** | x64 / ARM64 | `Ghost Shell_<ver>_<arch>_en-US.msi` |
| **macOS** | Apple Silicon | `Ghost Shell_<ver>_aarch64.dmg` |
| **macOS** | Intel | `Ghost Shell_<ver>_x64.dmg` |
| **macOS** | Universal | `Ghost Shell_<ver>_universal.dmg` |
| **Linux** | x86_64 | `.AppImage` · `.deb` · `.rpm` |

`<ver>` is the semver from `package.json` (e.g. `1.0.0`).

---

## Installation

### Windows

**NSIS installer (`.exe`)** — recommended for most users.

1. Download `Ghost Shell_<ver>_x64-setup.exe` (or `arm64` on ARM PCs).
2. If SmartScreen appears, choose **More info → Run anyway** (see [Signing](#signing) below).
3. Complete the installer.

**MSIX (`.msix`)** — modern package format; useful for sideloading or Microsoft Store submission.

1. Download `Ghost Shell_<ver>_x64.msix` (or `_arm64`).
2. **First time only:** trust the development certificate (CI builds use a self-signed cert):
   ```powershell
   # Run as Administrator — only needed for CI/dev-signed MSIX
   winapp cert install .\packaging\windows\devcert.pfx
   ```
3. Double-click the `.msix` or run:
   ```powershell
   Add-AppxPackage ".\Ghost Shell_1.0.0.0_x64.msix"
   ```

**Silent MSI install (IT / managed):**
```powershell
msiexec /i "Ghost Shell_1.0.0_x64_en-US.msi" /qn
```

### macOS

1. Open the `.dmg` and drag **Ghost Shell** to **Applications**.
2. Clear quarantine (unsigned builds):
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Ghost Shell.app"
   ```
3. On macOS 15+, use **System Settings → Privacy & Security → Open Anyway** if Gatekeeper blocks the first launch.

### Linux

**AppImage:**
```bash
chmod +x "Ghost Shell_1.0.0_amd64.AppImage"
./"Ghost Shell_1.0.0_amd64.AppImage"
```

**Debian / Ubuntu:**
```bash
sudo apt install "./Ghost Shell_1.0.0_amd64.deb"
```

**Fedora / RHEL:**
```bash
sudo dnf install "./Ghost Shell-1.0.0-1.x86_64.rpm"
```

**Verify signed packages** (when `LINUX_GPG_PRIVATE_KEY` is configured in CI):
```bash
gpg --import ghost-compiler-signing-key.asc
debsigs --verify Ghost\ Shell_1.0.0_amd64.deb   # or check .asc sidecars
```

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org) 20+ (CI uses 24)
- [Rust](https://rustup.rs) stable + [Tauri prerequisites](https://tauri.app/start/prerequisites/)
- **Windows MSIX builds:** [WinApp CLI](https://learn.microsoft.com/en-us/windows/apps/dev-tools/winapp-cli/) (`winget install Microsoft.WinAppCLI`)

### The `ghost` CLI

All project tasks go through `scripts/ghost.js`:

```bash
npm run ghost dev              # install deps + Tauri dev (Ctrl+R restart, Ctrl+C quit)
npm run ghost build            # build for current OS
npm run ghost build win:64     # Windows x64 (+ MSIX on Windows runners)
npm run ghost build linux      # Linux AppImage + deb + rpm
npm run ghost build mac        # all macOS targets
npm run ghost icon             # regenerate icons from src/assets/app-icon.png
```

#### Build targets

| Target | Output |
|--------|--------|
| *(none)* / `linux` | Current OS installers |
| `win:64` | Windows x64 `.exe` + `.msi` + `.msix` |
| `win:arm` | Windows ARM64 `.exe` + `.msi` + `.msix` |
| `win` | Both Windows architectures |
| `mac:intel` / `mac:arm` / `mac:universal` | macOS `.dmg` |
| `mac` | All macOS variants |

Final artifacts are flattened into `build/`; intermediates (`src-tauri/target`, `dist`) are removed automatically.

```
build/
├── Ghost Shell_1.0.0_x64-setup.exe
├── Ghost Shell_1.0.0_x64_en-US.msi
├── Ghost Shell_1.0.0.0_x64.msix
├── Ghost Shell_1.0.0_amd64.AppImage
├── Ghost Shell_1.0.0_amd64.deb
└── Ghost Shell-1.0.0-1.x86_64.rpm
```

---

## Project structure

```
ghost-shell/
├── .github/workflows/build.yml    # CI: parallel builds, signing, releases
├── packaging/windows/
│   └── Package.appxmanifest       # MSIX identity (Ghost Compiler / Ghost Shell)
├── scripts/
│   ├── ghost.js                   # dev / build / icon CLI
│   ├── package-msix.ps1           # MSIX pack + sign (winapp CLI)
│   ├── sign-windows.ps1           # Authenticode hook for Tauri bundler
│   └── sign-linux.sh              # GPG sign deb/rpm
├── src/                           # React frontend
│   ├── pages/                     # hosts, keychain, logs, login, …
│   ├── provider/                  # security, terminal, theme
│   ├── components/                # UI + terminal-view
│   └── layouts/                   # dashboard shell
├── src-tauri/                     # Rust / Tauri backend
│   ├── src/                       # vault, ssh, secure_store, …
│   ├── tauri.conf.json            # shared bundle + branding
│   ├── tauri.windows.conf.json    # Windows signing + NSIS/WiX
│   └── tauri.linux.conf.json      # deb/rpm metadata
└── package.json
```

---

## CI / release management

Workflow: `.github/workflows/build.yml`

| Job | Runners | Produces |
|-----|---------|----------|
| `linux` | `ubuntu-22.04` | AppImage, deb, rpm (+ GPG sigs if configured) |
| `windows-x64` | `windows-latest` | NSIS exe, MSI, **MSIX x64** |
| `windows-arm64` | `windows-latest` | NSIS exe, MSI, **MSIX arm64** |
| `macos-*` | `macos-latest` | DMG per architecture |

**Release job** runs when:
- A `v*` tag is pushed, or
- `main` builds succeed, or
- Manual dispatch with **Publish release** enabled

Artifacts are merged and uploaded to GitHub Releases as `v<package.json version>`.

---

## Signing

### Windows (free / CI default)

CI generates a **self-signed development certificate** with Microsoft's WinApp CLI:

```powershell
cd packaging/windows
winapp cert generate --if-exists skip
```

This certificate:
- Signs **NSIS `.exe`**, **WiX `.msi`**, and **MSIX** during CI builds
- Matches publisher **`CN=Ghost Compiler`** in `Package.appxmanifest`
- Is suitable for **local testing and sideloading** — users must trust the cert once

**Production signing (optional GitHub secrets):**

| Secret | Purpose |
|--------|---------|
| `WINDOWS_SIGN_PFX_BASE64` | Base64-encoded `.pfx` from a trusted CA |
| `WINDOWS_SIGN_PFX_PASSWORD` | PFX password |

When set, CI uses your production cert instead of the generated dev cert.

**Microsoft Store:** submit the MSIX or NSIS `.exe` via Partner Center — Store re-signs MSIX packages automatically (free).

### Linux

When repository secrets are configured, CI signs packages with GPG:

| Secret | Purpose |
|--------|---------|
| `LINUX_GPG_PRIVATE_KEY` | ASCII-armored private key |
| `LINUX_GPG_PASSPHRASE` | Key passphrase (if any) |
| `LINUX_GPG_KEY_ID` | Optional explicit key id |

Script: `scripts/sign-linux.sh` — uses `debsigs` / `dpkg-sig` for `.deb` and `rpmsign` for `.rpm`. A public key is exported as `ghost-compiler-signing-key.asc`.

Without secrets, Linux packages build **unsigned** (same as before).

### macOS

Notarization and Apple Developer signing are **not yet configured**. macOS builds are ad-hoc signed only. See [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/) when you add an Apple Developer account.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Shell | [Tauri 2](https://tauri.app) (Rust) |
| SSH | [russh](https://github.com/Eugeny/russh) |
| Terminal | [xterm.js](https://xtermjs.org) |
| Frontend | [React 19](https://react.dev) · [Vite](https://vite.dev) · [React Router](https://reactrouter.com) |
| UI | [Tailwind CSS 4](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) |
| Crypto | AES-256-GCM vault · PBKDF2 · OS keychain |

---

## Roadmap

- [x] Cross-platform shell, routing, theming
- [x] `ghost` developer CLI + parallel CI
- [x] SSH terminal sessions + session logs
- [x] Encrypted vault, keychain, host management
- [x] Import / export, auto-unlock, Windows MSIX packaging
- [x] Windows (self-signed) + Linux (GPG) CI signing hooks
- [ ] SFTP file browser & transfers
- [ ] macOS notarization
- [ ] Production OV/EV Windows certificate

---

## Contributing

1. Fork the repo and create a feature branch.
2. `npm run ghost dev` — make your changes.
3. `npm run ghost build` on your platform.
4. Open a PR with a clear description.

---

## License

Source-available under the **[Ghost Shell License](LICENSE)**.

You may use, modify, and redistribute the source. The product name **Ghost Shell**, the publisher **Ghost Compiler**, and the copyright notice must be preserved. Rebranding requires prior written permission.
