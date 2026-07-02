#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <npm-workspace> <target-triple> <bundles>" >&2
  exit 2
fi

workspace="$1"
target_triple="$2"
bundles="$3"
attempts="${BANDSCOPE_TAURI_BUILD_ATTEMPTS:-1}"

if ! [[ "$attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "BANDSCOPE_TAURI_BUILD_ATTEMPTS must be a positive integer" >&2
  exit 2
fi

cleanup_macos_dmg_state() {
  local dmg_dir="apps/desktop/src-tauri/target/${target_triple}/release/bundle/dmg"
  rm -rf "$dmg_dir"

  if command -v hdiutil >/dev/null 2>&1; then
    hdiutil info || true
    hdiutil detach "/Volumes/BandScope" -force || true
    hdiutil detach "/Volumes/BandScope 0.1.3" -force || true
  fi
}

for ((attempt = 1; attempt <= attempts; attempt++)); do
  echo "Tauri bundle build attempt ${attempt}/${attempts} for ${target_triple} (${bundles})"
  if npm exec --workspace "$workspace" -- tauri build --target "$target_triple" --bundles "$bundles"; then
    exit 0
  fi

  status="$?"
  if [ "$attempt" -eq "$attempts" ]; then
    exit "$status"
  fi

  echo "::warning::Tauri bundle build failed with exit ${status}; cleaning partial DMG state before retry."
  if [[ "$bundles" == *dmg* ]]; then
    cleanup_macos_dmg_state
  fi
  sleep 10
done
