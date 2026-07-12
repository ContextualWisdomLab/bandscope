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

# Resolve the repository root from this script's own location so cleanup always
# targets absolute build paths, regardless of the caller's working directory.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cleanup_macos_dmg_state() {
  local dmg_dir="${repo_root}/apps/desktop/src-tauri/target/${target_triple}/release/bundle/dmg"
  rm -rf "$dmg_dir"

  if command -v hdiutil >/dev/null 2>&1; then
    # Detach every mounted BandScope volume rather than relying on a hardcoded
    # version string, so partial DMG mounts are cleaned up across releases.
    local volume
    while IFS= read -r volume; do
      [ -n "$volume" ] || continue
      hdiutil detach "$volume" -force || true
    done < <(hdiutil info 2>/dev/null | grep -oE '/Volumes/BandScope.*$' || true)
  fi
}

cleanup_windows_nsis_state() {
  local nsis_dir="${repo_root}/apps/desktop/src-tauri/target/${target_triple}/release/bundle/nsis"
  rm -rf "$nsis_dir"
}

for ((attempt = 1; attempt <= attempts; attempt++)); do
  echo "Tauri bundle build attempt ${attempt}/${attempts} for ${target_triple} (${bundles})"
  if npm exec --workspace "$workspace" -- tauri build --target "$target_triple" --bundles "$bundles"; then
    exit 0
  else
    status="$?"
  fi

  if [ "$attempt" -eq "$attempts" ]; then
    echo "::error::Tauri bundle build failed after ${attempts} attempt(s) for ${target_triple} (${bundles}); last exit status ${status}."
    exit "$status"
  fi

  echo "::warning::Tauri bundle build failed with exit ${status}; cleaning partial bundle state before retry."
  if [[ "$bundles" == *dmg* ]]; then
    cleanup_macos_dmg_state
  fi
  if [[ "$bundles" == *nsis* ]]; then
    cleanup_windows_nsis_state
  fi
  sleep 10
done
