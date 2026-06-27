# Ghost Shell

A desktop SSH/SFTP client built with **Tauri 2** + **React 19** + **Vite** and **Tailwind / shadcn-ui**.

The whole project lifecycle is driven by a single CLI — `scripts/ghost.js` — exposed through
the `ghost` npm script. You never call `vite` or `tauri` directly.

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
📁 Collecting distributables → build
🧹 Removing build intermediates (src-tauri/target)...
✅ Done. Distributables are in build/
```

### Cross-build (e.g. all Windows targets)

```bash
npm run ghost build win
```

Outputs are namespaced per target:

```
build/
├─ x86_64-pc-windows-msvc/
└─ aarch64-pc-windows-msvc/
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
