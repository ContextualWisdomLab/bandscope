from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, check=check, text=True)


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"unexpected {label} shape")
    path.write_text(text.replace(old, new), encoding="utf-8")


def main() -> None:
    run("npm", "install", "--global", "npm@10.9.8")
    run("npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund")

    test_path = ROOT / "apps/desktop/src/features/score/scoreStorage.test.ts"
    marker = '  it.each([\n'
    regression = '''  it("copies each validated bridge byte during the same read", async () => {
    const response: unknown[] = [0];
    let reads = 0;
    Object.defineProperty(response, 0, {
      configurable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? 255 : 256;
      }
    });
    stubReadResponse(response);

    const result = await readScorePdf("project-1", "score-1");

    expect(Array.from(result)).toEqual([255]);
    expect(reads).toBe(1);
  });

'''
    replace_once(test_path, marker, regression + marker, "score regression insertion point")
    run("git", "config", "user.name", "CWL repair bot")
    run("git", "config", "user.email", "actions@users.noreply.github.com")
    run("git", "add", str(test_path.relative_to(ROOT)))
    run("git", "commit", "-m", "test(score): prevent bridge byte re-read coercion")

    red = run(
        "npm", "exec", "--workspace", "@bandscope/desktop", "--",
        "vitest", "run", "src/features/score/scoreStorage.test.ts", "--coverage=false",
        check=False,
    )
    if red.returncode == 0:
        raise RuntimeError("expected byte re-read regression to fail before implementation")

    storage_path = ROOT / "apps/desktop/src/features/score/scoreStorage.ts"
    replace_once(
        storage_path,
        '''  if (Array.isArray(response)) {
    for (let index = 0; index < response.length; index += 1) {
      const byte = response[index];
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw new Error(INVALID_RESPONSE_MESSAGE);
      }
    }
    return Uint8Array.from(response as number[]);
  }
''',
        '''  if (Array.isArray(response)) {
    const bytes = new Uint8Array(response.length);
    for (let index = 0; index < response.length; index += 1) {
      const byte = response[index];
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw new Error(INVALID_RESPONSE_MESSAGE);
      }
      bytes[index] = byte;
    }
    return bytes;
  }
''',
        "plain-array byte conversion",
    )
    replace_once(
        ROOT / "CHANGELOG.md",
        "- Reject malformed plain-array PDF bridge responses instead of allowing `Uint8Array.from` to wrap, truncate, or coerce values outside the exact byte range.",
        "- Reject malformed plain-array PDF bridge responses and copy each validated byte during the same read, preventing coercion or accessor-driven value changes between validation and conversion.",
        "score changelog",
    )

    run(
        "npm", "exec", "--workspace", "@bandscope/desktop", "--",
        "vitest", "run", "src/features/score/scoreStorage.test.ts", "--coverage=false",
    )
    run("npm", "run", "lint", "--workspace", "@bandscope/desktop")
    run("npm", "run", "typecheck", "--workspace", "@bandscope/desktop")
    run("npm", "run", "test", "--workspace", "@bandscope/desktop")
    run("npm", "run", "build", "--workspace", "@bandscope/desktop")
    run("./scripts/harness/quickcheck.sh")

    (ROOT / ".github/workflows/repair-pr-750-byte-copy.yml").unlink()
    Path(__file__).unlink()
    run(
        "git", "add", "CHANGELOG.md",
        "apps/desktop/src/features/score/scoreStorage.ts",
        "apps/desktop/src/features/score/scoreStorage.test.ts",
        ".github/workflows/repair-pr-750-byte-copy.yml",
        ".github/scripts/repair_pr_750.py",
    )
    run("git", "commit", "-m", "fix(score): copy validated bridge bytes once")
    run("git", "push", "origin", "HEAD:fix/score-pdf-byte-validation-clean")


if __name__ == "__main__":
    main()
