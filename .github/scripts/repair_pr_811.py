from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Run one repository command and propagate failures by default."""
    return subprocess.run(args, cwd=ROOT, check=check, text=True)


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    """Replace one exact source fragment or fail before mutating the branch."""
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"unexpected {label} shape")
    path.write_text(text.replace(old, new), encoding="utf-8")


def implement_fail_closed_argument_dispatch() -> None:
    """Reject every malformed explicit argument mode before standard input."""
    cli_path = ROOT / "services/analysis-engine/src/bandscope_analysis/cli.py"
    replace_once(
        cli_path,
        '''        if cli_args[0] == "--status":
            json.dump(get_analysis_status(), sys.stdout)
            return 0
        if cli_args[0] == "--job":
''',
        '''        if cli_args[0] == "--status":
            if len(cli_args) != 1:
                json.dump(
                    failed_cli_response("--status does not accept additional arguments"),
                    sys.stdout,
                )
                return 1
            json.dump(get_analysis_status(), sys.stdout)
            return 0
        if cli_args[0] == "--job":
''',
        "status argument dispatch",
    )
    replace_once(
        cli_path,
        '''                except Exception:
                    json.dump(failed_cli_response("Failed to read job file"), sys.stdout)
                    return 1

    if input_data is None:
''',
        '''                except Exception:
                    json.dump(failed_cli_response("Failed to read job file"), sys.stdout)
                    return 1
        else:
            json.dump(failed_cli_response("Unsupported CLI arguments"), sys.stdout)
            return 1

    if input_data is None:
''',
        "unknown argument dispatch",
    )

    changelog_path = ROOT / "CHANGELOG.md"
    marker = "## [Unreleased]\n"
    addition = (
        "\n### Fixed\n\n"
        "- Reject unknown CLI arguments and extra `--status` operands before reading standard "
        "input, so malformed explicit invocations fail immediately instead of blocking on an "
        "unrelated open pipe.\n"
    )
    replace_once(changelog_path, marker, marker + addition, "Unreleased heading")


def main() -> None:
    """Execute focused RED/GREEN, full verification, and workflow self-removal."""
    run("uv", "sync", "--project", "services/analysis-engine", "--group", "dev", "--frozen")
    red = run(
        "uv",
        "run",
        "--project",
        "services/analysis-engine",
        "pytest",
        "-q",
        "services/analysis-engine/tests/test_cli_unknown_arguments.py",
        check=False,
    )
    if red.returncode == 0:
        raise RuntimeError("expected malformed explicit argument dispatch to fail before repair")

    implement_fail_closed_argument_dispatch()
    run(
        "uv",
        "run",
        "--project",
        "services/analysis-engine",
        "pytest",
        "-q",
        "services/analysis-engine/tests/test_cli_unknown_arguments.py",
        "services/analysis-engine/tests/test_cli_input_bounds.py",
        "services/analysis-engine/tests/test_cli.py",
    )
    run("./scripts/harness/quickcheck.sh")

    (ROOT / ".github/workflows/repair-pr-811-argument-dispatch.yml").unlink()
    Path(__file__).unlink()
    run("git", "config", "user.name", "CWL repair bot")
    run("git", "config", "user.email", "actions@users.noreply.github.com")
    run(
        "git",
        "add",
        "CHANGELOG.md",
        "services/analysis-engine/src/bandscope_analysis/cli.py",
        "services/analysis-engine/tests/test_cli_unknown_arguments.py",
        ".github/workflows/repair-pr-811-argument-dispatch.yml",
        ".github/scripts/repair_pr_811.py",
    )
    run("git", "commit", "-m", "fix(cli): reject unsupported explicit arguments")
    run("git", "push", "origin", "HEAD:fix-cli-unbounded-read-5165758910965089497")


if __name__ == "__main__":
    main()
