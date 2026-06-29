#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build"

if [[ ! -d "$BUILD_DIR" ]]; then
  echo "No build/ directory found — skipping Linux signing."
  exit 0
fi

if [[ -z "${LINUX_GPG_PRIVATE_KEY:-}" ]]; then
  echo "LINUX_GPG_PRIVATE_KEY is not set — skipping Linux package signing."
  exit 0
fi

GPG_HOME="${RUNNER_TEMP:-/tmp}/ghost-shell-gpg"
mkdir -p "$GPG_HOME"
chmod 700 "$GPG_HOME"

export GNUPGHOME="$GPG_HOME"

if [[ -n "${LINUX_GPG_PASSPHRASE:-}" ]]; then
  echo "$LINUX_GPG_PASSPHRASE" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --import <(printf '%s' "$LINUX_GPG_PRIVATE_KEY")
else
  printf '%s' "$LINUX_GPG_PRIVATE_KEY" | gpg --batch --import
fi

KEY_ID="${LINUX_GPG_KEY_ID:-}"
if [[ -z "$KEY_ID" ]]; then
  KEY_ID="$(gpg --list-secret-keys --with-colons | awk -F: '/^sec:/ {print $5; exit}')"
fi

if [[ -z "$KEY_ID" ]]; then
  echo "Could not determine GPG key id for Linux signing."
  exit 1
fi

echo "Signing Linux packages with key: $KEY_ID"

shopt -s nullglob

if command -v debsigs >/dev/null 2>&1; then
  for deb in "$BUILD_DIR"/*.deb; do
    echo "Signing $deb"
    debsigs --sign=origin -k "$KEY_ID" "$deb"
  done
elif command -v dpkg-sig >/dev/null 2>&1; then
  for deb in "$BUILD_DIR"/*.deb; do
    echo "Signing $deb"
    dpkg-sig -k "$KEY_ID" --sign builder "$deb"
  done
else
  for deb in "$BUILD_DIR"/*.deb; do
  echo "Signing $deb (detached .sig)"
    gpg --batch --armor --detach-sign --local-user "$KEY_ID" "$deb"
  done
fi

if command -v rpmsign >/dev/null 2>&1; then
  cat > "$GPG_HOME/rpmmacros" <<EOF
%_signature gpg
%_gpg_name $KEY_ID
EOF
  for rpm in "$BUILD_DIR"/*.rpm; do
    echo "Signing $rpm"
    rpmsign --addsign "$rpm"
  done
else
  for rpm in "$BUILD_DIR"/*.rpm; do
    echo "Signing $rpm (detached .sig)"
    gpg --batch --armor --detach-sign --local-user "$KEY_ID" "$rpm"
  done
fi

gpg --batch --armor --export "$KEY_ID" > "$BUILD_DIR/ghost-compiler-signing-key.asc"
echo "Exported public key to build/ghost-compiler-signing-key.asc"
