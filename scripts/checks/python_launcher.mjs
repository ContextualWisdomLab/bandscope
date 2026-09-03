import { spawnSync } from "node:child_process";
import process from "node:process";

export function pythonCandidates(platform = process.platform) {
  if (platform === "win32") {
    return [
      ["py", ["-3"]],
      ["python", []],
      ["python3", []],
    ];
  }

  return [
    ["python3", []],
    ["python", []],
  ];
}

export function runPython(args, options = {}) {
  const { cwd, env, platform = process.platform, stdio = "inherit" } = options;

  for (const [command, prefix] of pythonCandidates(platform)) {
    const result = spawnSync(command, [...prefix, ...args], {
      cwd,
      env,
      stdio,
    });

    if (result.error?.code === "ENOENT") {
      continue;
    }
    if (result.error) {
      console.error(`Unable to start ${command}: ${result.error.message}`);
      return 127;
    }
    return result.status ?? 1;
  }

  console.error("Unable to find a Python interpreter.");
  return 127;
}
