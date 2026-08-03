"""Install the reviewed standalone desktop coverage-lock contract."""

from __future__ import annotations

import json
from pathlib import Path

DESKTOP_PACKAGE = Path("apps/desktop/package.json")
SYNC_SCRIPT = Path("apps/desktop/scripts/sync_coverage_lock.mjs")
PROXY_SOURCE = Path("apps/desktop/src/shared-types-proxy.ts")
SELF = Path("scripts/ci/bootstrap_desktop_coverage_lock.py")
WORKFLOW = Path(".github/workflows/bootstrap-desktop-coverage-lock.yml")

SYNC_SCRIPT_CONTENT = r'''import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const desktopManifestPath = resolve(desktopRoot, "package.json");
const desktopLockPath = resolve(desktopRoot, "package-lock.json");
const rootLockPath = resolve(repositoryRoot, "package-lock.json");
const proxyPath = resolve(desktopRoot, "src/shared-types-proxy.ts");
const expectedProxy = 'export * from "../../../packages/shared-types/src/index";\n';
const localPackageName = "@bandscope/shared-types";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sortedObject(entries) {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}

function dependencyNames(metadata, includeDevelopment = false) {
  const names = new Set();
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of Object.keys(metadata[field] ?? {})) names.add(name);
  }
  if (includeDevelopment) {
    for (const name of Object.keys(metadata.devDependencies ?? {})) names.add(name);
  }
  return [...names].sort();
}

function resolutionDirectories(packagePath) {
  const directories = [packagePath];
  let current = packagePath;
  while (current) {
    const marker = current.lastIndexOf("/node_modules/");
    if (marker >= 0) {
      current = current.slice(0, marker);
      directories.push(current);
      continue;
    }
    directories.push("");
    break;
  }
  return [...new Set(directories)];
}

function resolveDependency(packages, ownerPath, dependencyName) {
  for (const directory of resolutionDirectories(ownerPath)) {
    const candidate = directory
      ? `${directory}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
  }
  return null;
}

function targetPath(sourcePath) {
  const desktopPrefix = "apps/desktop/";
  return sourcePath.startsWith(desktopPrefix)
    ? sourcePath.slice(desktopPrefix.length)
    : sourcePath;
}

export function buildDesktopCoverageLock(rootLock, desktopManifest) {
  if (rootLock.lockfileVersion !== 3 || typeof rootLock.packages !== "object") {
    throw new Error("root package-lock.json must be lockfileVersion 3 with a packages map");
  }
  const rootDesktop = rootLock.packages["apps/desktop"];
  if (!rootDesktop) throw new Error("root lock is missing apps/desktop workspace metadata");

  const rootEntry = {
    name: desktopManifest.name,
    version: desktopManifest.version,
    dependencies: clone(desktopManifest.dependencies ?? {}),
    devDependencies: clone(desktopManifest.devDependencies ?? {})
  };
  const selected = new Map([["", rootEntry]]);
  const visited = new Set();
  const queue = [];

  for (const dependencyName of dependencyNames(rootEntry, true)) {
    if (dependencyName === localPackageName) continue;
    const sourcePath = resolveDependency(rootLock.packages, "apps/desktop", dependencyName);
    if (!sourcePath) throw new Error(`root lock cannot resolve desktop dependency ${dependencyName}`);
    queue.push(sourcePath);
  }

  while (queue.length > 0) {
    const sourcePath = queue.shift();
    if (visited.has(sourcePath)) continue;
    visited.add(sourcePath);
    const metadata = rootLock.packages[sourcePath];
    if (!metadata) throw new Error(`root lock metadata disappeared for ${sourcePath}`);
    if (metadata.link === true) {
      throw new Error(`unexpected workspace link in desktop dependency graph: ${sourcePath}`);
    }
    selected.set(targetPath(sourcePath), clone(metadata));

    for (const dependencyName of dependencyNames(metadata)) {
      if (dependencyName === localPackageName) continue;
      const dependencyPath = resolveDependency(rootLock.packages, sourcePath, dependencyName);
      if (dependencyPath) queue.push(dependencyPath);
      else if (Object.hasOwn(metadata.dependencies ?? {}, dependencyName)) {
        throw new Error(`${sourcePath} cannot resolve required dependency ${dependencyName}`);
      }
    }
  }

  selected.set("node_modules/@bandscope/shared-types", {
    resolved: ".",
    link: true
  });

  return {
    name: desktopManifest.name,
    version: desktopManifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: sortedObject(selected)
  };
}

function serializedExpectedLock() {
  const rootLock = readJson(rootLockPath);
  const desktopManifest = readJson(desktopManifestPath);
  if (desktopManifest.exports !== "./src/shared-types-proxy.ts") {
    throw new Error("desktop exports must route the standalone self-link through shared-types-proxy.ts");
  }
  if (readFileSync(proxyPath, "utf8") !== expectedProxy) {
    throw new Error("shared-types proxy drifted from the repository-bounded source contract");
  }
  return `${JSON.stringify(buildDesktopCoverageLock(rootLock, desktopManifest), null, 2)}\n`;
}

const mode = process.argv[2] ?? "--check";
const expected = serializedExpectedLock();
if (mode === "--write") {
  writeFileSync(desktopLockPath, expected, "utf8");
} else if (mode === "--check") {
  const actual = readFileSync(desktopLockPath, "utf8");
  if (actual !== expected) {
    throw new Error("apps/desktop/package-lock.json is stale; run sync_coverage_lock.mjs --write");
  }
} else {
  throw new Error(`unsupported mode: ${mode}`);
}
'''

PROXY_CONTENT = 'export * from "../../../packages/shared-types/src/index";\n'


def main() -> int:
    """Patch the desktop package and install deterministic lock synchronization."""
    package = json.loads(DESKTOP_PACKAGE.read_text(encoding="utf-8"))
    package["exports"] = "./src/shared-types-proxy.ts"
    test_script = package["scripts"]["test"]
    prefix = "node scripts/sync_coverage_lock.mjs --check && "
    if not test_script.startswith(prefix):
        package["scripts"]["test"] = prefix + test_script
    DESKTOP_PACKAGE.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")

    SYNC_SCRIPT.parent.mkdir(parents=True, exist_ok=True)
    SYNC_SCRIPT.write_text(SYNC_SCRIPT_CONTENT, encoding="utf-8")
    PROXY_SOURCE.write_text(PROXY_CONTENT, encoding="utf-8")

    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
