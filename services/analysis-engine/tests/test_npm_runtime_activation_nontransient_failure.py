"""Regression for non-transient npm runtime acquisition failures."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_ACTIVATION_HELPER = (
    _REPOSITORY_ROOT / "scripts" / "checks" / "activate_pinned_npm_runtime.sh"
)


def _write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def _run_corepack_failure(
    tmp_path: Path,
    *,
    diagnostic: str,
) -> tuple[subprocess.CompletedProcess[str], Path, Path, Path, Path]:
    """Run the activation helper against one deterministic Corepack failure."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    count_file = tmp_path / "corepack-count.txt"
    sleep_log = tmp_path / "sleep.log"
    enable_log = tmp_path / "enable.log"
    npm_log = tmp_path / "npm.log"

    _write_executable(
        fake_bin / "node",
        "#!/usr/bin/env bash\ncat >/dev/null\nprintf 'npm@10.9.9'\n",
    )
    _write_executable(
        fake_bin / "corepack",
        f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "install" ]]; then
  count=0
  if [[ -f "$BANDSCOPE_TEST_COREPACK_COUNT" ]]; then
    count="$(cat "$BANDSCOPE_TEST_COREPACK_COUNT")"
  fi
  count=$((count + 1))
  printf '%s' "$count" > "$BANDSCOPE_TEST_COREPACK_COUNT"
  printf '%s\\n' {diagnostic!r} >&2
  exit 1
fi
if [[ "$1" == "enable" ]]; then
  printf '%s\\n' "$*" >> "$BANDSCOPE_TEST_ENABLE_LOG"
  exit 0
fi
exit 64
""",
    )
    _write_executable(
        fake_bin / "sleep",
        "#!/usr/bin/env bash\nprintf '%s\\n' \"$1\" >> \"$BANDSCOPE_TEST_SLEEP_LOG\"\n",
    )
    _write_executable(
        fake_bin / "npm",
        "#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" >> \"$BANDSCOPE_TEST_NPM_LOG\"\n",
    )

    environment = os.environ.copy()
    environment["PATH"] = f"{fake_bin}{os.pathsep}{environment['PATH']}"
    environment["BANDSCOPE_TEST_COREPACK_COUNT"] = str(count_file)
    environment["BANDSCOPE_TEST_SLEEP_LOG"] = str(sleep_log)
    environment["BANDSCOPE_TEST_ENABLE_LOG"] = str(enable_log)
    environment["BANDSCOPE_TEST_NPM_LOG"] = str(npm_log)

    completed = subprocess.run(
        ["bash", str(_ACTIVATION_HELPER)],
        cwd=tmp_path,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    return completed, count_file, sleep_log, enable_log, npm_log


def _assert_immediate_failure(
    completed: subprocess.CompletedProcess[str],
    count_file: Path,
    sleep_log: Path,
    enable_log: Path,
    npm_log: Path,
) -> None:
    """Require one acquisition attempt and no downstream activation work."""
    assert completed.returncode != 0
    assert count_file.read_text(encoding="utf-8") == "1"
    assert not sleep_log.exists()
    assert not enable_log.exists()
    assert not npm_log.exists()


@pytest.mark.skipif(
    os.name == "nt",
    reason="shell helper is exercised by hosted Windows lanes",
)
def test_pinned_npm_activation_does_not_retry_signature_failure(tmp_path: Path) -> None:
    """A provenance/signature failure must fail immediately instead of being retried."""
    result = _run_corepack_failure(
        tmp_path,
        diagnostic="Signature does not match the expected keyid",
    )

    _assert_immediate_failure(*result)
    assert "Signature does not match" in result[0].stderr


@pytest.mark.skipif(
    os.name == "nt",
    reason="shell helper is exercised by hosted Windows lanes",
)
def test_pinned_npm_activation_does_not_retry_unknown_failure(tmp_path: Path) -> None:
    """An unclassified Corepack failure must fail closed instead of being guessed transient."""
    result = _run_corepack_failure(
        tmp_path,
        diagnostic="Corepack failed while validating package-manager metadata",
    )

    _assert_immediate_failure(*result)
    assert "validating package-manager metadata" in result[0].stderr
    assert "not classified as transient" in result[0].stderr
