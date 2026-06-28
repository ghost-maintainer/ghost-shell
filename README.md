# Ghost Shell

A desktop SSH/SFTP client built with **Tauri 2** + **React 19** + **Vite** and **Tailwind / shadcn-ui**.

The whole project lifecycle is driven by a single CLI — `scripts/ghost.js` — exposed through
the `ghost` npm script. You never call `vite` or `tauri` directly.

---

## Download

### **[⬇ Download the latest release →](https://github.com/ghost-maintainer/ghost-shell/releases/latest)**

Prebuilt installers for every platform are published on the
[**Releases**](https://github.com/ghost-maintainer/ghost-shell/releases) page
(created automatically when a `v*` tag is pushed). Pick the file that matches your system:

| Platform    | Architecture           | File to download                                                |
| ----------- | ---------------------- | --------------------------------------------------------------- |
| **Windows** | x64 (Intel / AMD)      | `Ghost Shell_<ver>_x64-setup.exe`  ·  `Ghost Shell_<ver>_x64_en-US.msi`   |
| **Windows** | ARM64                  | `Ghost Shell_<ver>_arm64-setup.exe`  ·  `Ghost Shell_<ver>_arm64_en-US.msi` |
| **macOS**   | Apple Silicon (M1+)    | `Ghost Shell_<ver>_aarch64.dmg`                                 |
| **macOS**   | Intel                  | `Ghost Shell_<ver>_x64.dmg`                                     |
| **macOS**   | Universal (any Mac)    | `Ghost Shell_<ver>_universal.dmg`                              |
| **Linux**   | x86_64                 | `Ghost Shell_<ver>_amd64.AppImage`  ·  `..._amd64.deb`  ·  `...-1.x86_64.rpm` |

> `<ver>` is the release version (e.g. `0.1.0`). On GitHub, spaces in asset names are shown as
> dots (`Ghost.Shell_...`) — that's normal.

> [!WARNING]
> **All builds are unsigned.** This project has no Apple Developer, Windows code-signing, or
> Linux package-signing certificates, so every OS will warn you the first time you open the app.
> The installers are safe — you just need to tell your OS to trust them. See the steps below.

---

## Installation

### 🪟 Windows

Unsigned, so **SmartScreen** shows *"Windows protected your PC."*

1. Run **`Ghost Shell_<ver>_x64-setup.exe`** (or the `.msi`). Use the `arm64` files on ARM devices.
2. On the blue SmartScreen dialog, click **More info → Run anyway**.
3. Continue through the installer.

Silent / managed install via MSI:

```powershell
msiexec /i "Ghost Shell_<ver>_x64_en-US.msi" /qn
```

### 🍎 macOS

Unsigned and un-notarized, so Gatekeeper blocks the first launch with either
*"Ghost Shell is damaged and can't be opened"* or *"…cannot be opened because Apple cannot check
it for malicious software."* This is expected — clear the quarantine flag:

1. Open the `.dmg` and drag **Ghost Shell** into **Applications**
   (Apple Silicon → `aarch64`, Intel → `x64`, or `universal` for any Mac).
2. Remove the quarantine attribute (most reliable fix):

   ```bash
   xattr -dr com.apple.quarantine "/Applications/Ghost Shell.app"
   ```

3. Launch **Ghost Shell** normally from Applications / Launchpad.

**No-Terminal alternative:** try to open the app once (it gets blocked), then go to
**System Settings → Privacy & Security**, scroll down, and click **Open Anyway**, then confirm.
(On macOS 15 Sequoia the old right-click → Open shortcut was removed, so use this Settings method
or the `xattr` command above.)

### 🐧 Linux (x86_64)

No signature prompts, but the packages are unofficial. Choose one format:

**AppImage** — portable, no install:

```bash
chmod +x "Ghost Shell_<ver>_amd64.AppImage"
./"Ghost Shell_<ver>_amd64.AppImage"
```

> Needs FUSE. On Ubuntu 22.04+: `sudo apt install libfuse2`.

**Debian / Ubuntu (.deb):**

```bash
sudo apt install "./Ghost Shell_<ver>_amd64.deb"
# or: sudo dpkg -i "Ghost Shell_<ver>_amd64.deb" && sudo apt -f install
```

**Fedora / RHEL / openSUSE (.rpm):**

```bash
sudo dnf install "./Ghost Shell-<ver>-1.x86_64.rpm"
# or: sudo rpm -i "Ghost Shell-<ver>-1.x86_64.rpm"
```

---

## Requirements

- **Node.js** 18+ (ESM)
- **Rust** + Cargo (for the Tauri shell) — https://rustup.rs
- **npm** (ships with Node)

---

## Commands

All commands run through `npm run ghost <command> [target]`.

| Command                      | What it does                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run ghost dev`          | Installs dependencies, then starts the Tauri dev server.                                       |
| `npm run ghost build`        | Builds for the **current OS**, collects distributables, removes intermediates.                |
| `npm run ghost build <tgt>`  | Cross-builds for a specific target/group (see below).                                          |
| `npm run ghost icon`         | Regenerates all app icons from `src/assets/app-icon.png`.                                       |

### Build targets

| Target          | Meaning                                  |
| --------------- | ---------------------------------------- |
| _(none)_        | Current operating system                 |
| `linux`         | Current OS (alias)                       |
| `win:64`        | Windows x86_64                           |
| `win:arm`       | Windows ARM64                            |
| `win`           | Group: `win:64` + `win:arm`              |
| `mac:arm`       | macOS Apple Silicon                      |
| `mac:intel`     | macOS Intel                              |
| `mac:universal` | macOS universal binary                   |
| `mac`           | Group: `mac:arm` + `mac:intel` + `mac:universal` |

Missing Rust targets are added automatically via `rustup target add`.

---

## Demo

### Develop

```bash
npm run ghost dev
```

```
📦 Installing dependencies (npm install)...
🚀 Starting Tauri dev server...  (Ctrl+R restart · Ctrl+C quit)
```

While the dev server is running:

- **Ctrl + R** — restart the dev server
- **Ctrl + C** — quit **and remove `node_modules`** (clean slate for next run)

> Every `dev` run reinstalls dependencies, so the tree is always fresh.

### Build (current OS)

```bash
npm run ghost build
```

```
📦 Installing dependencies (npm install)...
🔨 Building for current OS...
📁 Collecting installers → build/
   • Ghost Shell_0.1.0_x64.dmg
🧹 Removing build intermediates (src-tauri/target)...
✅ Done. Distributables are in build/
```

Only the final installer files land in `build/` — flattened, with no nested folders or
build junk:

```
build/
├─ Ghost Shell_0.1.0_x64-setup.exe
└─ Ghost Shell_0.1.0_x64_en-US.msi
```

### Cross-build (e.g. all Windows targets)

```bash
npm run ghost build win
```

All targets' installers land directly in `build/` (filenames are arch-specific, so they don't
collide):

```
build/
├─ Ghost Shell_0.1.0_x64-setup.exe
├─ Ghost Shell_0.1.0_x64_en-US.msi
├─ Ghost Shell_0.1.0_arm64-setup.exe
└─ Ghost Shell_0.1.0_arm64_en-US.msi
```

### Regenerate icons

```bash
npm run ghost icon
```

---

## What lands where

After a build, **only the final distributables** (installers / app bundles) are kept in
`build/`. The heavy Rust `src-tauri/target/` directory and raw binaries are deleted to keep the
repo lean.

| Path                | Kept? | Notes                                                   |
| ------------------- | ----- | ------------------------------------------------------- |
| `build/`            | ✅    | Final `.app` / `.dmg` / `.msi` / `.exe` / `.deb`        |
| `src-tauri/target/` | ❌    | Removed after each build (success **or** failure)       |
| `dist/`             | ❌    | Vite frontend output; removed after build (success/fail)|
| `node_modules/`     | ❌\*  | Removed when you `Ctrl+C` out of `dev`                  |

\* Reinstalled automatically on the next `dev` / `build`.

`build/` and `node_modules/` are git-ignored.
