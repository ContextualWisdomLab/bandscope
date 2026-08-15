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


def isolate_stdin_mode_tests() -> None:
    """Make stdin-mode CLI tests independent of the pytest runner's argv."""
    test_path = ROOT / "services/analysis-engine/tests/test_cli.py"
    text = test_path.read_text(encoding="utf-8")
    targets = (
        ("test_cli_main_reads_stdin_and_writes_stdout", "cli.sys"),
        ("test_cli_main_handles_non_mapping_payload", "cli.sys"),
        ("test_cli_main_rejects_invalid_job_id", "cli.sys"),
        ("test_cli_main_handles_malformed_json", "cli.sys"),
        ("test_cli_module_runs_as_main", "sys"),
        ("test_cli_main_empty_input", "cli.sys"),
    )

    for function_name, sys_expr in targets:
        start = text.find(f"def {function_name}(")
        if start < 0:
            raise RuntimeError(f"missing stdin-mode test {function_name}")
        next_def = text.find("\ndef ", start + 1)
        end = len(text) if next_def < 0 else next_def
        block = text[start:end]
        if f'monkeypatch.setattr({sys_expr}, "argv"' in block:
            raise RuntimeError(f"unexpected existing argv isolation in {function_name}")
        stdin_line = f'    monkeypatch.setattr({sys_expr}, "stdin", stdin)\n'
        if block.count(stdin_line) != 1:
            raise RuntimeError(f"unexpected stdin patch shape in {function_name}")
        block = block.replace(
            stdin_line,
            f'    monkeypatch.setattr({sys_expr}, "argv", ["cli.py"])\n' + stdin_line,
        )
        text = text[:start] + block + text[end:]

    test_path.write_text(text, encoding="utf-8")


def main() -> None:
    """Execute focused RED/GREEN, full verification, and workflow self-removal."""
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
    isolate_stdin_mode_tests()
    run(
        "python3",
        "scripts/checks/run_analysis_command.py",
        "ruff",
        "format",
        "src/bandscope_analysis/cli.py",
    )
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
        "services/analysis-engine/tests/test_cli.py",
        "services/analysis-engine/tests/test_cli_unknown_arguments.py",
        ".github/workflows/repair-pr-811-argument-dispatch.yml",
        ".github/scripts/repair_pr_811.py",
    )
    run("git", "commit", "-m", "fix(cli): reject unsupported explicit arguments")
    run("git", "push", "origin", "HEAD:fix-cli-unbounded-read-5165758910965089497")


if __name__ == "__main__":
    main()
