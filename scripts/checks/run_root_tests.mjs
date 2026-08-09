import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const workspaceArgs = process.argv.slice(2).filter((arg) => arg !== "--coverage");

function run(command, args) {
  const executable = process.platform === "win32" && command === "npm" ? process.execPath : command;
  const actualArgs =
    process.platform === "win32" && command === "npm"
      ? [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), ...args]
      : args;
  const printable = [command, ...args].join(" ");
  console.log(`Running root test command: ${printable}`);
  const result = spawnSync(executable, actualArgs, {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Unable to start ${command}: ${result.error.message}`);
    process.exit(127);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPython(args) {
  const candidates =
    process.platform === "win32"
      ? [
          ["py", ["-3"]],
          ["python", []],
          ["python3", []],
        ]
      : [
          ["python3", []],
          ["python", []],
        ];

  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, ...args], {
      stdio: "inherit",
    });

    if (result.error) {
      continue;
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    return;
  }

  console.error("Unable to find a Python interpreter for analysis-engine tests.");
  process.exit(127);
}

const npmWorkspaceTestArgs = ["run", "test", "--workspaces", "--if-present"];
if (workspaceArgs.length > 0) {
  npmWorkspaceTestArgs.push("--", ...workspaceArgs);
}

run("npm", npmWorkspaceTestArgs);
runPython([
  "scripts/checks/run_analysis_command.py",
  "pytest",
  "tests",
  "-m",
  "not youtube_stem_e2e",
  "--cov=src/bandscope_analysis",
  "--cov-report=term-missing",
  "--cov-fail-under=100",
]);
