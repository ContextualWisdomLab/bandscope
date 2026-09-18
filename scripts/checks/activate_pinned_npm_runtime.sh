#!/usr/bin/env bash
set -euo pipefail

readonly MAX_ATTEMPTS="3"

package_manager_spec="$({
  node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (typeof manifest.packageManager !== "string" || !/^npm@[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.packageManager)) {
  throw new Error("package.json must pin packageManager to an exact npm version");
}
process.stdout.write(manifest.packageManager);
NODE
} 2>&1)" || {
  printf '%s\n' "$package_manager_spec" >&2
  exit 1
}

attempt=1
while true; do
  acquisition_output=""
  if acquisition_output="$(corepack install --global "$package_manager_spec" 2>&1)"; then
    if [[ -n "$acquisition_output" ]]; then
      printf '%s\n' "$acquisition_output" >&2
    fi
    break
  fi

  printf '%s\n' "$acquisition_output" >&2
  case "$acquisition_output" in
    *"ETIMEDOUT"*)
      ;;
    *)
      echo "Corepack acquisition failure is not classified as transient; refusing to retry or weaken verification." >&2
      exit 1
      ;;
  esac

  if (( attempt >= MAX_ATTEMPTS )); then
    echo "Failed to acquire $package_manager_spec after $MAX_ATTEMPTS attempts; refusing an unpinned npm fallback." >&2
    exit 1
  fi

  sleep_seconds=$((attempt * 5))
  echo "Corepack acquisition attempt $attempt failed with an admitted transient timeout; retrying exact $package_manager_spec in ${sleep_seconds}s." >&2
  sleep "$sleep_seconds"
  attempt=$((attempt + 1))
done

corepack enable npm
npm run check:npm-runtime
