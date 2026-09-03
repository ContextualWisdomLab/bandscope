import process from "node:process";

import { runPython } from "./python_launcher.mjs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/checks/run_python.mjs <python arguments...>");
  process.exitCode = 2;
} else {
  process.exitCode = runPython(args, { cwd: process.cwd() });
}
