#!/usr/bin/env node
/**
 * Ghost CLI — Tauri + React project management
 *
 * Usage (via npm scripts):
 *   npm run ghost dev            install deps → run dev server (Ctrl+C wipes node_modules)
 *   npm run ghost icon           generate app icons from src/assets/app-icon.png
 *   npm run ghost build [target] build, copy distributables → build/, remove intermediates
 *
 * Targets: win | win:64 | win:arm | linux | mac | mac:arm | mac:intel | mac:universal
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICON_PATH = path.join("src", "assets", "app-icon.png");
const IS_WIN = process.platform === "win32";

// Project paths the CLI manages
const NODE_MODULES = path.join(ROOT, "node_modules");
const TARGET_DIR = path.join(ROOT, "src-tauri", "target");
const DIST_DIR = path.join(ROOT, "dist"); // vite frontend output (intermediate)
const BUILD_DIR = path.join(ROOT, "build"); // final distributables land here

// Rust target triples for cross builds
const TARGETS = {
  "win:64": "x86_64-pc-windows-msvc",
  "win:arm": "aarch64-pc-windows-msvc",
  "mac:arm": "aarch64-apple-darwin",
  "mac:intel": "x86_64-apple-darwin",
  "mac:universal": "universal-apple-darwin",
};

// Group commands that fan out into multiple target builds
const GROUPS = {
  win: ["win:64", "win:arm"],
  mac: ["mac:arm", "mac:intel", "mac:universal"],
};

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: IS_WIN,
      cwd: ROOT,
      ...opts,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Dependency management
// ---------------------------------------------------------------------------
async function installDeps() {
  console.log("\n📦 Installing dependencies (npm install)...\n");
  await run(IS_WIN ? "npm.cmd" : "npm", ["install"]);
}

function removeNodeModules() {
  if (fs.existsSync(NODE_MODULES)) {
    console.log("\n🧹 Removing node_modules...\n");
    fs.rmSync(NODE_MODULES, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Build artifacts: keep only the final distributables, drop the rest
// ---------------------------------------------------------------------------
// Tauri writes installers/app bundles under:
//   src-tauri/target/release/bundle               (current OS)
//   src-tauri/target/<triple>/release/bundle      (cross builds)
function bundleDirFor(target) {
  return target
    ? path.join(TARGET_DIR, target, "release", "bundle")
    : path.join(TARGET_DIR, "release", "bundle");
}

function collectArtifacts(target) {
  const bundleDir = bundleDirFor(target);
  if (!fs.existsSync(bundleDir)) {
    console.warn(`⚠️  No bundle directory found at ${bundleDir} — skipping copy.`);
    return;
  }
  const dest = target ? path.join(BUILD_DIR, target) : BUILD_DIR;
  fs.mkdirSync(dest, { recursive: true });
  console.log(`\n📁 Collecting distributables → ${path.relative(ROOT, dest)}\n`);
  fs.cpSync(bundleDir, dest, { recursive: true });
}

// Drop everything that isn't the final distributable: the Rust target dir
// (binaries/intermediates) and the Vite dist output. Safe to call on both
// success and failure — only removes dirs that exist.
function cleanIntermediates() {
  for (const [label, dir] of [
    ["src-tauri/target", TARGET_DIR],
    ["dist", DIST_DIR],
  ]) {
    if (fs.existsSync(dir)) {
      console.log(`🧹 Removing build intermediates (${label})...`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

async function ensureTarget(target) {
  try {
    await run("rustup", ["target", "add", target]);
  } catch (err) {
    console.warn(
      `⚠️  Could not add rust target "${target}" automatically (${err.message}). ` +
        `Make sure it's installed and the right toolchain (e.g. Windows ARM64 build tools) is present.`,
    );
  }
}

async function tauriBuild(target) {
  const args = ["tauri", "build"];
  if (target) {
    await ensureTarget(target);
    args.push("--target", target);
  }
  console.log(
    `\n🔨 Building${target ? ` (${target})` : " for current OS"}...\n`,
  );
  await run("npx", args);
  collectArtifacts(target);
}

async function buildMany(targetKeys) {
  for (const key of targetKeys) {
    await tauriBuild(TARGETS[key]);
  }
}

async function buildIcon() {
  console.log(`\n🎨 Generating app icons from ${ICON_PATH}...\n`);
  await run("npx", ["tauri", "icon", ICON_PATH]);
}

// ---------------------------------------------------------------------------
// Dev server: survives crashes, Ctrl+R restarts, Ctrl+C quits cleanly
// ---------------------------------------------------------------------------
function startDev() {
  let child = null;
  let manualKill = false; // true while we're killing on purpose (restart/quit)

  function spawnDev() {
    console.log(
      "\n🚀 Starting Tauri dev server...  (Ctrl+R restart · Ctrl+C quit)\n",
    );
    child = spawn("npx", ["tauri", "dev"], {
      stdio: "inherit",
      shell: IS_WIN,
      cwd: ROOT,
      // own process group on Unix so we can kill the whole tree via -pid
      detached: !IS_WIN,
    });

    child.on("exit", (code, signal) => {
      if (manualKill) {
        manualKill = false;
        return;
      }
      child = null;
      if (signal) return; // killed by something external, don't auto-loop
      console.log(
        `\n⚠️  Dev server stopped (exit code ${code}). It will stay open — ` +
          `press Ctrl+R to restart, or Ctrl+C to quit.\n`,
      );
    });

    child.on("error", (err) => {
      console.error(`\n⚠️  Dev server error: ${err.message}\n`);
    });
  }

  function killChild() {
    return new Promise((resolve) => {
      if (!child) return resolve();
      manualKill = true;
      const pid = child.pid;
      const done = () => resolve();
      if (IS_WIN) {
        // taskkill terminates the whole process tree on Windows
        spawn("taskkill", ["/pid", String(pid), "/T", "/F"]).on("exit", done);
      } else {
        // negative pid signals the process group (spawned without detached,
        // so fall back to the pid itself if the group kill fails)
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          try {
            process.kill(pid, "SIGTERM");
          } catch {
            /* already gone */
          }
        }
        done();
      }
    });
  }

  async function restart() {
    console.log("\n🔁 Restarting dev server...\n");
    await killChild();
    spawnDev();
  }

  async function quit() {
    await killChild();
    removeNodeModules();
    cleanupStdin();
    process.exit(0);
  }

  function cleanupStdin() {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  }

  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (str, key) => {
      if (!key || !key.ctrl) return;
      if (key.name === "r") restart();
      else if (key.name === "c") quit();
    });
  } else {
    console.log(
      "ℹ️  stdin is not a TTY — Ctrl+R restart shortcut is unavailable here.",
    );
  }

  // Fallback for non-raw / non-TTY environments where Ctrl+C arrives as SIGINT
  process.on("SIGINT", quit);
  process.on("exit", cleanupStdin);
  spawnDev();
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
const [, , command, target] = process.argv;

(async () => {
  try {
    switch (command) {
      case "dev":
        await installDeps(); // fresh deps on every dev run
        startDev(); // intentionally not awaited — keeps process alive on its own
        break;

      case "icon":
        await buildIcon();
        break;

      case "build": {
        await installDeps(); // build needs node_modules (vite + tauri)
        if (!target || target === "linux") {
          await tauriBuild(); // build for whatever OS this is run on
        } else if (TARGETS[target]) {
          await tauriBuild(TARGETS[target]);
        } else if (GROUPS[target]) {
          await buildMany(GROUPS[target]);
        } else {
          console.error(`Unknown build target: "${target}"`);
          process.exit(1);
        }
        cleanIntermediates(); // drop target/ + dist/; keep build/ distributables
        console.log(
          `\n✅ Done. Distributables are in ${path.relative(ROOT, BUILD_DIR)}/\n`,
        );
        break;
      }

      default:
        console.error(`Unknown ghost command: "${command}"`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ ${err.message}\n`);
    if (command === "build") cleanIntermediates(); // tidy up partial builds too
    process.exit(1);
  }
})();
