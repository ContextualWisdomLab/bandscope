from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Run one repository command with deterministic failure propagation."""
    return subprocess.run(args, cwd=ROOT, check=check, text=True)


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    """Replace exactly one expected source fragment."""
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"unexpected {label} shape")
    path.write_text(text.replace(old, new), encoding="utf-8")


def implement_payload_safe_errors() -> None:
    """Retain structural error locations without echoing caller-controlled keys."""
    source_path = ROOT / "packages/shared-types/src/naruon.ts"
    source = source_path.read_text(encoding="utf-8")
    source = source.replace(
        "/** Return the first key outside an exact allowlist. */",
        "/** Return the structural parent path when an object contains an unknown key. */",
    )
    old = """  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      return `${path}.${key}`;
    }
  }
"""
    new = """  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      return path;
    }
  }
"""
    if source.count(old) != 1:
        raise RuntimeError("unexpected unknown-key helper shape")
    source = source.replace(old, new)
    for variable in (
        "sourceExtra",
        "normExtra",
        "eventExtra",
        "commitmentExtra",
        "provenanceExtra",
        "rootExtra",
        "extra",
    ):
        before = f"`${{{variable}}} is not allowed`"
        after = f"`${{{variable}}} contains an unexpected field`"
        if source.count(before) != 1:
            raise RuntimeError(f"unexpected {variable} error shape")
        source = source.replace(before, after)
    source_path.write_text(source, encoding="utf-8")

    test_path = ROOT / "packages/shared-types/test/naruon.test.ts"
    tests = test_path.read_text(encoding="utf-8")
    replacements = {
        '"root.extra"': '"root contains an unexpected field"',
        '"source.extra"': '"source contains an unexpected field"',
        '"normGroup.extra"': '"normGroup contains an unexpected field"',
        '"event.extra"': '"event contains an unexpected field"',
        '"commitment.extra"': '"commitment contains an unexpected field"',
        '"provenance.extra"': '"provenance contains an unexpected field"',
        '"evidence[0].extra"': '"evidence[0] contains an unexpected field"',
    }
    for before, after in replacements.items():
        if tests.count(before) != 1:
            raise RuntimeError(f"unexpected naruon test expectation: {before}")
        tests = tests.replace(before, after)
    test_path.write_text(tests, encoding="utf-8")

    docs_path = ROOT / "docs/integrations/naruon.md"
    marker = "Parsing snapshots caller-owned data once before validation and canonicalization."
    insertion = (
        "Validation errors identify the structural object containing an unknown field but never "
        "echo the caller-controlled field name. This preserves actionable location without "
        "copying tenant, person, credential, or other payload text into logs.\n\n"
    )
    replace_once(docs_path, marker, insertion + marker, "naruon privacy insertion point")

    changelog_path = ROOT / "CHANGELOG.md"
    old_entry = (
        "- Add a versioned, dependency-free BandScope → naruon rehearsal handoff contract with "
        "Band norm-group identity, Event and Commitment semantics, calibrated provenance, "
        "deterministic JSON serialization, and a public JSON Schema while preserving BandScope's "
        "standalone local-first operation."
    )
    replace_once(
        changelog_path,
        old_entry,
        old_entry
        + " Unknown-field errors retain the structural object path without echoing "
        "caller-controlled field names.",
        "naruon changelog entry",
    )


def main() -> None:
    """Execute RED, minimal implementation, GREEN verification, and self-removal."""
    run("npm", "install", "--global", "npm@10.9.8")
    run("npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund")

    red = run(
        "npm",
        "exec",
        "--workspace",
        "@bandscope/shared-types",
        "--",
        "vitest",
        "run",
        "test/naruon-error-redaction.test.ts",
        "--coverage=false",
        check=False,
    )
    if red.returncode == 0:
        raise RuntimeError("expected unknown-field key leakage before implementation")

    implement_payload_safe_errors()
    run(
        "npm",
        "exec",
        "--workspace",
        "@bandscope/shared-types",
        "--",
        "vitest",
        "run",
        "test/naruon-error-redaction.test.ts",
        "--coverage=false",
    )
    run("npm", "run", "lint", "--workspace", "@bandscope/shared-types")
    run("npm", "run", "typecheck", "--workspace", "@bandscope/shared-types")
    run("npm", "run", "test", "--workspace", "@bandscope/shared-types")
    run("./scripts/harness/quickcheck.sh")

    (ROOT / ".github/workflows/repair-pr-737-payload-safe-errors.yml").unlink()
    Path(__file__).unlink()
    run("git", "config", "user.name", "CWL repair bot")
    run("git", "config", "user.email", "actions@users.noreply.github.com")
    run(
        "git",
        "add",
        "CHANGELOG.md",
        "docs/integrations/naruon.md",
        "packages/shared-types/src/naruon.ts",
        "packages/shared-types/test/naruon.test.ts",
        "packages/shared-types/test/naruon-error-redaction.test.ts",
        ".github/workflows/repair-pr-737-payload-safe-errors.yml",
        ".github/scripts/repair_pr_737.py",
    )
    run("git", "commit", "-m", "fix(integration): keep naruon errors payload-safe")
    run("git", "push", "origin", "HEAD:feat/naruon-rehearsal-handoff-v1")


if __name__ == "__main__":
    main()
