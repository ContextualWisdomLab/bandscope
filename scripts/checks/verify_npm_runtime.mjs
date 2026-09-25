import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const EXPECTED_NPM_VERSION = "10.9.9";
const MINIMUM_TAR_VERSION = "7.5.19";

function failClosed() {
  console.error("npm runtime provenance check failed");
  process.exit(1);
}

function readPackageVersion(packagePath) {
  try {
    const document = JSON.parse(readFileSync(packagePath, "utf8"));
    if (
      typeof document !== "object" ||
      document === null ||
      typeof document.version !== "string"
    ) {
      failClosed();
    }
    return document.version;
  } catch {
    failClosed();
  }
}

function parseNumericVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    failClosed();
  }
  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function versionAtLeast(actual, minimum) {
  const actualParts = parseNumericVersion(actual);
  const minimumParts = parseNumericVersion(minimum);
  for (let index = 0; index < minimumParts.length; index += 1) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
}

const npmExecPath = process.env.npm_execpath;
if (typeof npmExecPath !== "string" || npmExecPath.length === 0) {
  failClosed();
}

const npmRoot = resolve(dirname(npmExecPath), "..");
const npmVersion = readPackageVersion(resolve(npmRoot, "package.json"));
const tarVersion = readPackageVersion(resolve(npmRoot, "node_modules", "tar", "package.json"));

if (npmVersion !== EXPECTED_NPM_VERSION || !versionAtLeast(tarVersion, MINIMUM_TAR_VERSION)) {
  failClosed();
}

console.log(`verified npm ${npmVersion} with bundled tar ${tarVersion}`);
