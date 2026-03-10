#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" == "Darwin" ]] && command -v xcodebuild >/dev/null 2>&1; then
  if ! xcodebuild -license check >/dev/null 2>&1; then
    printf 'Xcode license not accepted. Run: sudo xcodebuild -license\n' >&2
    exit 1
  fi
fi

cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
