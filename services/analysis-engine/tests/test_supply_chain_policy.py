"""Tests for repository supply-chain and workflow coverage checks."""

from __future__ import annotations

import importlib
import json
import re
import stat
import zipfile
from pathlib import Path

import pytest
import yaml
from conftest import load_module, make_symlink_or_skip


def central_required_workflow_policy_text() -> str:
    """Return the repository policy text that delegates review automation centrally."""
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "docs" / "workflow" / "pr-review-merge-scheduler.md").read_text(
        encoding="utf-8"
    )


def assert_local_review_workflows_removed() -> None:
    """Ensure this repository does not carry local copies of central review workflows."""
    repo_root = Path(__file__).resolve().parents[3]
    assert not (repo_root / ".github" / "workflows" / "opencode-review.yml").exists()
    assert not (repo_root / ".github" / "workflows" / "pr-review-merge-scheduler.yml").exists()
    for helper in (
        "classify_failed_check_evidence.py",
        "collect_failed_check_evidence.sh",
        "emit_opencode_failed_check_fallback_findings.sh",
        "opencode_review_approve_gate.sh",
        "opencode_review_normalize_output.py",
        "pr_review_merge_scheduler.py",
        "validate_opencode_failed_check_review.sh",
    ):
        assert not (repo_root / "scripts" / "ci" / helper).exists()


def test_supply_chain_check_requires_multi_arch_runner_labels(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure missing multi-arch workflow tokens are reported as violations."""
    supply_chain = load_module("scripts/checks/verify_supply_chain.py", "verify_supply_chain")

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "build-baseline.yml").write_text(
        """
name: build-baseline
jobs:
  build-windows:
    runs-on: windows-latest
  build-macos:
    runs-on: macos-latest
""".strip(),
        encoding="utf-8",
    )
    for path in supply_chain.REQUIRED_FILES:
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_text("placeholder", encoding="utf-8")
    (tmp_path / ".github" / "dependabot.yml").write_text(
        "\n".join(
            [
                'package-ecosystem: "npm"',
                'package-ecosystem: "pip"',
                'package-ecosystem: "cargo"',
                'package-ecosystem: "github-actions"',
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert "build workflow missing token: windows-11-arm" in violations
    assert "build workflow missing token: macos-15-intel" in violations
    assert "build workflow missing token: bandscope-windows-arm64-${{ github.sha }}" in violations
    assert "build workflow missing token: bandscope-macos-amd64-${{ github.sha }}" in violations
    assert "build workflow missing token: Get-MpComputerStatus" in violations


def test_supply_chain_check_accepts_repo_multi_arch_workflow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure the checked-in multi-arch workflow satisfies the baseline policy."""
    supply_chain = load_module("scripts/checks/verify_supply_chain.py", "verify_supply_chain_repo")
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    violations = supply_chain.verify_workflow_coverage()

    assert not any("build workflow missing token" in violation for violation in violations)
    assert (
        "build workflow should not rely on windows-latest for architecture coverage"
        not in violations
    )
    assert (
        "build workflow should not rely on macos-latest for architecture coverage" not in violations
    )


def test_build_baseline_upload_artifact_pins_are_consistent() -> None:
    """Ensure all upload-artifact steps use the same reviewed SHA pin."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow = (repo_root / ".github" / "workflows" / "build-baseline.yml").read_text(
        encoding="utf-8"
    )
    pins = re.findall(r"actions/upload-artifact@([A-Fa-f0-9]{40})", workflow)

    assert pins
    assert len(set(pins)) == 1


def test_windows_antivirus_probe_logs_defender_provider_failures() -> None:
    """Ensure hosted-runner Defender provider errors do not fail Windows builds."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow = (repo_root / ".github" / "workflows" / "build-baseline.yml").read_text(
        encoding="utf-8"
    )

    assert workflow.count("Get-MpComputerStatus -ErrorAction Stop") == 2
    assert workflow.count("Antivirus check: Defender telemetry query failed") == 2
    assert workflow.count("$products = Get-CimInstance -Namespace root/SecurityCenter2") == 2
    assert workflow.count("$defenderService = Get-Service -Name WinDefend") == 2


def test_supply_chain_check_requires_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure checkout workflows suppress Git initial-branch warnings at source."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_checkout_default_branch_guard",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == [
        ".github/workflows/ci.yml: workflows using actions/checkout must set "
        "workflow-level GIT_CONFIG_* init.defaultBranch env to avoid Git "
        "initial-branch warnings"
    ]


def test_supply_chain_check_rejects_commented_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure commented guard examples do not satisfy the checkout warning guard."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_commented_checkout_default_branch_guard",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
# env:
#   GIT_CONFIG_COUNT: "1"
#   GIT_CONFIG_KEY_0: init.defaultBranch
#   GIT_CONFIG_VALUE_0: develop
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == [
        ".github/workflows/ci.yml: workflows using actions/checkout must set "
        "workflow-level GIT_CONFIG_* init.defaultBranch env to avoid Git "
        "initial-branch warnings"
    ]


def test_supply_chain_check_ignores_commented_checkout_reference(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure commented checkout references do not trigger guard enforcement."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_commented_checkout_reference",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
# - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: node --version
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == []


def test_supply_chain_check_ignores_run_step_checkout_reference(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure run-step checkout text does not trigger guard enforcement."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_run_step_checkout_reference",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == []


def test_supply_chain_check_rejects_run_step_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure later shell text does not satisfy the checkout warning guard."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_run_step_checkout_default_branch_guard",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - run: |
          GIT_CONFIG_COUNT: "1"
          GIT_CONFIG_KEY_0: init.defaultBranch
          GIT_CONFIG_VALUE_0: develop
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == [
        ".github/workflows/ci.yml: workflows using actions/checkout must set "
        "workflow-level GIT_CONFIG_* init.defaultBranch env to avoid Git "
        "initial-branch warnings"
    ]


def test_supply_chain_check_rejects_nested_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure a single nested env block cannot satisfy the workflow guard."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_nested_checkout_default_branch_guard",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
jobs:
  guarded:
    runs-on: ubuntu-latest
    env:
      GIT_CONFIG_COUNT: "1"
      GIT_CONFIG_KEY_0: init.defaultBranch
      GIT_CONFIG_VALUE_0: develop
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
  unguarded:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == [
        ".github/workflows/ci.yml: workflows using actions/checkout must set "
        "workflow-level GIT_CONFIG_* init.defaultBranch env to avoid Git "
        "initial-branch warnings"
    ]


def test_supply_chain_check_rejects_top_level_nested_env_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure nested top-level env maps cannot satisfy the checkout warning guard."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_top_level_nested_env_checkout_default_branch_guard",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
env:
  CONFIGS:
    GIT_CONFIG_COUNT: "1"
    GIT_CONFIG_KEY_0: init.defaultBranch
    GIT_CONFIG_VALUE_0: develop
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == [
        ".github/workflows/ci.yml: workflows using actions/checkout must set "
        "workflow-level GIT_CONFIG_* init.defaultBranch env to avoid Git "
        "initial-branch warnings"
    ]


def test_supply_chain_check_accepts_checkout_default_branch_guard_comments(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure top-level env comments do not break valid checkout warning guards."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_checkout_default_branch_guard_comments",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ci.yml").write_text(
        """
name: ci
env: # Git subprocess defaults inherited by actions/checkout.
  GIT_CONFIG_COUNT: "1" # one key/value pair follows
  GIT_CONFIG_KEY_0: init.defaultBranch
  GIT_CONFIG_VALUE_0: develop
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == []


def test_supply_chain_check_accepts_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure checked-in checkout workflows carry the warning guard."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_repo_checkout_default_branch_guard",
    )
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == []


def test_supply_chain_check_accepts_scorecard_step_level_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard can avoid global env while still guarding checkout."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_scorecard_step_level_checkout_default_branch_guard",
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
jobs:
  analysis:
    name: ossf-scorecard
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        env:
          GIT_CONFIG_COUNT: "1"
          GIT_CONFIG_KEY_0: init.defaultBranch
          GIT_CONFIG_VALUE_0: develop
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)
        with:
          publish_results: PUBLISH_GUARD
  scorecard-sarif-upload:
    name: scorecard-sarif-upload
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        env:
          GIT_CONFIG_COUNT: "1"
          GIT_CONFIG_KEY_0: init.defaultBranch
          GIT_CONFIG_VALUE_0: develop
""".strip().replace("PUBLISH_GUARD", publish_guard),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == []


def test_supply_chain_check_rejects_scorecard_missing_checkout_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard checkout steps require the step-level Git guard."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_scorecard_missing_checkout_default_branch_guard",
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
jobs:
  analysis:
    name: ossf-scorecard
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)
        with:
          publish_results: PUBLISH_GUARD
""".strip().replace("PUBLISH_GUARD", publish_guard),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert any(
        supply_chain.OSSF_CHECKOUT_DEFAULT_BRANCH_GUARD_VIOLATION in violation
        for violation in violations
    )


def test_supply_chain_check_ignores_scorecard_publish_mentions_in_comments(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure comment text does not make a workflow look like Scorecard publish."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_scorecard_publish_comment_mentions",
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "checkout.yml").write_text(
        """
name: checkout
on:
  pull_request:
env:
  GIT_CONFIG_COUNT: "1"
  GIT_CONFIG_KEY_0: init.defaultBranch
  GIT_CONFIG_VALUE_0: develop
jobs:
  checkout:
    runs-on: ubuntu-latest
    steps:
      # uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a
      # publish_results: true
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_checkout_default_branch_guard()

    assert violations == []


def test_python_security_audit_does_not_ignore_patched_pygments_advisory() -> None:
    """Ensure patched Python advisories are not left as stale audit ignores."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow = (repo_root / ".github" / "workflows" / "security-audit.yml").read_text(
        encoding="utf-8"
    )
    dependency_policy = (repo_root / "docs" / "security" / "dependency-policy.md").read_text(
        encoding="utf-8"
    )
    python_lockfile = (repo_root / "services" / "analysis-engine" / "uv.lock").read_text(
        encoding="utf-8"
    )

    assert "--ignore-vuln GHSA-5239-wwwm-4pmq" not in workflow
    assert "uv run --project services/analysis-engine --with pip-audit==2.8.0" in workflow
    assert "pip-audit --local --strict" in workflow
    assert "Pygments <2.20.0" in dependency_policy
    assert "pip-audit --local --strict" in dependency_policy
    tomllib = importlib.import_module("tomllib")
    lock = tomllib.loads(python_lockfile)
    packages = lock.get("package", [])
    pygments = [package for package in packages if package.get("name") == "pygments"]

    assert len(pygments) == 1
    assert pygments[0].get("version") == "2.20.0"
    assert all(package.get("version") != "2.19.2" for package in pygments)


def test_python_lockfile_keeps_msgpack_at_patched_advisory_version() -> None:
    """Ensure Trivy's msgpack crash advisory cannot re-enter the Python lockfile."""
    repo_root = Path(__file__).resolve().parents[3]
    python_lockfile = (repo_root / "services" / "analysis-engine" / "uv.lock").read_text(
        encoding="utf-8"
    )

    tomllib = importlib.import_module("tomllib")
    lock = tomllib.loads(python_lockfile)
    packages = lock.get("package", [])
    msgpack = [package for package in packages if package.get("name") == "msgpack"]

    assert len(msgpack) == 1
    assert msgpack[0].get("version") == "1.2.1"


def test_security_audit_workflow_keeps_dependency_vulnerability_scans() -> None:
    """Ensure the audit workflow keeps npm, Python, and Rust vulnerability scans."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow = (repo_root / ".github" / "workflows" / "security-audit.yml").read_text(
        encoding="utf-8"
    )

    assert "npm audit --workspaces --audit-level=high" in workflow
    assert "pip-audit --local --strict" in workflow
    assert "cargo +stable audit" in workflow


def test_supply_chain_check_requires_audit_tokens_in_run_steps(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure comments and env values cannot satisfy vulnerability scan coverage."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_audit_run_steps",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "security-audit.yml").write_text(
        """
name: security-audit
on:
  pull_request:
  push:
    branches: [develop, main]
env:
  AUDIT_EXAMPLES: npm audit --workspaces --audit-level=high
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Non-executed audit examples
        run: |
          true # npm audit --workspaces --audit-level=high
          # pip-audit --local --strict
          printf '%s\n' "cargo +stable audit"
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "security audit workflow missing vulnerability audit token: "
        "npm audit --workspaces --audit-level=high"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: pip-audit --local --strict"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: cargo +stable audit"
    ) in violations


def test_supply_chain_check_accepts_nested_shell_audit_commands(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure shell -c wrappers cannot hide real vulnerability scan commands."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_nested_shell_audit",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "security-audit.yml").write_text(
        """
name: security-audit
on:
  pull_request:
  push:
    branches: [develop, main]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Nested npm audit
        run: bash --norc -lc 'npm audit --workspaces --audit-level=high'
      - name: Nested Python audit
        run: sh -ec 'pip-audit --local --strict'
      - name: Nested Rust audit
        run: /bin/bash -c 'cargo +stable audit'
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert not any("missing vulnerability audit token" in item for item in violations)


def test_supply_chain_check_rejects_noop_audit_command_spoofs(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure shell no-op commands cannot satisfy vulnerability audit coverage."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_noop_audit_spoof",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "security-audit.yml").write_text(
        """
name: security-audit
on:
  pull_request:
  push:
    branches: [develop, main]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Spoof npm audit
        run: : npm audit --workspaces --audit-level=high
      - name: Spoof Python audit
        run: : pip-audit --local --strict
      - name: Spoof Rust audit
        run: : cargo +stable audit
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "security audit workflow missing vulnerability audit token: "
        "npm audit --workspaces --audit-level=high"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: pip-audit --local --strict"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: cargo +stable audit"
    ) in violations


def test_supply_chain_check_requires_blocking_audit_steps(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure continue-on-error audit steps cannot satisfy vulnerability coverage."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_blocking_audit",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "security-audit.yml").write_text(
        """
name: security-audit
on:
  pull_request:
  push:
    branches: [develop, main]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Non-blocking npm audit
        continue-on-error: true
        run: npm audit --workspaces --audit-level=high
      - name: Non-blocking Python audit
        continue-on-error: true
        run: pip-audit --local --strict
      - name: Non-blocking Rust audit
        continue-on-error: true
        run: cargo +stable audit
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "security audit workflow missing vulnerability audit token: "
        "npm audit --workspaces --audit-level=high"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: pip-audit --local --strict"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: cargo +stable audit"
    ) in violations


def test_supply_chain_check_requires_unconditional_audit_steps(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure conditional audit steps cannot satisfy vulnerability coverage."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_unconditional_audit",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "security-audit.yml").write_text(
        """
name: security-audit
on:
  pull_request:
  push:
    branches: [develop, main]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Skipped npm audit
        if: ${{ false }}
        run: npm audit --workspaces --audit-level=high
      - name: Skipped Python audit
        if: false
        run: pip-audit --local --strict
      - name: Skipped Rust audit
        if: github.ref == 'refs/heads/not-used'
        run: cargo +stable audit
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "security audit workflow missing vulnerability audit token: "
        "npm audit --workspaces --audit-level=high"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: pip-audit --local --strict"
    ) in violations
    assert (
        "security audit workflow missing vulnerability audit token: cargo +stable audit"
    ) in violations


def test_supply_chain_check_accepts_explicit_false_continue_on_error_audit_steps(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure explicitly blocking audit steps still satisfy coverage."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_explicit_false_continue_on_error",
    )
    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "security-audit.yml").write_text(
        """
name: security-audit
on:
  pull_request:
  push:
    branches: [develop, main]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Blocking npm audit
        continue-on-error: false
        run: npm audit --workspaces --audit-level=high
      - name: Blocking Python audit
        continue-on-error: "false"
        run: pip-audit --local --strict
      - name: Blocking Rust audit
        continue-on-error: ${{ false }}
        run: cargo +stable audit
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert not any("missing vulnerability audit token" in item for item in violations)


def test_supply_chain_check_requires_ossf_default_branch_guard(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure OSSF Scorecard is not invoked on non-default release branches."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_guard"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
      - main
  schedule:
    - cron: '30 1 * * 1'
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard workflow must guard Scorecard execution to the repository default branch"
        in violations
    )


def test_supply_chain_check_requires_ossf_guard_without_main_branch_token(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard guard validation cannot be bypassed by omitting main."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_guard_no_main"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
  schedule:
    - cron: '30 1 * * 1'
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard workflow must guard Scorecard execution to the repository default branch"
        in violations
    )


def test_supply_chain_check_rejects_hardcoded_ossf_publish_results_branch(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard publish settings follow the repository default branch."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_publish"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
      - main
  schedule:
    - cron: '30 1 * * 1'
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)
        with:
          publish_results: ${{ github.ref == 'refs/heads/develop' }}
""".strip(),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard publish_results must use the repository default branch guard" in violations
    )


def test_supply_chain_check_rejects_scorecard_global_env_when_publishing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard publish workflows do not use workflow-level env."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_scorecard_global_env",
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
      - main
  schedule:
    - cron: '30 1 * * 1'
env:
  GIT_CONFIG_COUNT: "1"
  GIT_CONFIG_KEY_0: init.defaultBranch
  GIT_CONFIG_VALUE_0: develop
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)
        with:
          publish_results: PUBLISH_GUARD
""".strip().replace("PUBLISH_GUARD", publish_guard),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert any(
        "ossf scorecard publishing workflow must not contain top-level env or defaults" in violation
        for violation in violations
    )


def test_supply_chain_check_rejects_scorecard_global_defaults_when_publishing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard publish workflows do not use workflow-level defaults."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_scorecard_global_defaults",
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        """
name: ossf-scorecard
on:
  push:
    branches:
      - develop
      - main
  schedule:
    - cron: '30 1 * * 1'
defaults:
  run:
    shell: bash
jobs:
  analysis:
    name: ossf-scorecard
    steps:
      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)
        with:
          publish_results: PUBLISH_GUARD
""".strip().replace("PUBLISH_GUARD", publish_guard),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert any(
        "ossf scorecard publishing workflow must not contain top-level env or defaults" in violation
        for violation in violations
    )


def test_supply_chain_check_rejects_ossf_publish_job_run_steps(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard publishing jobs satisfy OSSF uses-only restrictions."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_uses_only"
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]
    default_branch_ref = "format('refs/heads/{0}', github.event.repository.default_branch)"
    scorecard_action = (
        "      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        "\n".join(
            [
                "name: ossf-scorecard",
                "on:",
                "  push:",
                "    branches:",
                "      - develop",
                "      - main",
                "  schedule:",
                "    - cron: '30 1 * * 1'",
                "jobs:",
                "  analysis:",
                "    name: ossf-scorecard",
                "    steps:",
                "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
                scorecard_action,
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
                "      - name: Skip OSSF Scorecard on non-default branch",
                f"        if: github.ref != {default_branch_ref}",
                '        run: echo "skip"',
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert any(
        "ossf scorecard publishing job must only contain uses steps; split run steps "
        "into a separate non-publishing job" in violation
        for violation in violations
    )


def test_supply_chain_check_rejects_ossf_publish_run_steps_in_any_workflow(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure OSSF publishing restrictions follow Scorecard if it moves workflows."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_any_workflow"
    )
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]
    default_branch_ref = "format('refs/heads/{0}', github.event.repository.default_branch)"
    scorecard_action = (
        "      - uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3"
    )

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        "\n".join(
            [
                "name: ossf-scorecard",
                "on: push",
                "jobs:",
                "  analysis:",
                "    name: ossf-scorecard",
                "    steps:",
                "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
                scorecard_action,
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
            ]
        ),
        encoding="utf-8",
    )
    (workflow_dir / "scorecard-security-gate.yml").write_text(
        "\n".join(
            [
                "name: scorecard-security-gate",
                "on: push",
                "jobs:",
                "  moved-scorecard:",
                "    steps:",
                scorecard_action,
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
                "      - name: extra diagnostics",
                '        run: echo "this breaks OSSF publishing"',
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert any(
        violation.startswith(".github/workflows/scorecard-security-gate.yml:")
        and "ossf scorecard publishing job must only contain uses steps" in violation
        for violation in violations
    )


def test_supply_chain_check_accepts_repo_ossf_publish_restrictions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure checked-in OSSF Scorecard workflow follows publish restrictions."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_repo"
    )
    repo_root = Path(__file__).resolve().parents[3]

    monkeypatch.chdir(repo_root)

    violations = supply_chain.verify_workflow_coverage()

    assert not any("ossf scorecard" in violation for violation in violations)


def _workflow_trigger_mapping(workflow_text: str) -> dict[str, object]:
    """Parse one GitHub Actions workflow and return its top-level trigger mapping."""
    workflow_document = yaml.safe_load(workflow_text)
    assert isinstance(workflow_document, dict)
    workflow_triggers = workflow_document.get("on", workflow_document.get(True))
    assert isinstance(workflow_triggers, dict)
    return workflow_triggers


def _assert_trivy_pull_request_contract(workflow_text: str) -> None:
    """Require ordinary pull-request coverage for both protected branches only."""
    workflow_triggers = _workflow_trigger_mapping(workflow_text)
    assert "push" in workflow_triggers
    assert "pull_request_target" not in workflow_triggers
    pull_request_config = workflow_triggers.get("pull_request")
    assert isinstance(pull_request_config, dict)
    configured_branches = pull_request_config.get("branches")
    assert isinstance(configured_branches, list)
    protected_branches = {str(branch_name) for branch_name in configured_branches}
    assert {"develop", "main"}.issubset(protected_branches)


def test_central_governance_workflows_preserve_local_security_signal_boundaries() -> None:
    """Ensure local signals keep their intended push and PR trigger boundaries."""
    repo_root = Path(__file__).resolve().parents[3]
    workflows_dir = repo_root / ".github" / "workflows"

    assert not (workflows_dir / "dependency-review.yml").exists()

    for local_signal in ("codeql.yml", "ossf-scorecard.yml"):
        workflow_path = workflows_dir / local_signal
        assert workflow_path.exists(), (
            f"{local_signal} keeps repository-local security-tab/SAST signal "
            "while central required workflows handle PR enforcement"
        )
        workflow_triggers = _workflow_trigger_mapping(workflow_path.read_text(encoding="utf-8"))
        assert "push" in workflow_triggers, f"{local_signal} must retain push-based reporting"
        assert "pull_request" not in workflow_triggers, (
            f"{local_signal} must not become a duplicate PR gate"
        )
        assert "pull_request_target" not in workflow_triggers, (
            f"{local_signal} must not execute privileged target-context PR code"
        )

    trivy_workflow = workflows_dir / "trivy.yml"
    assert trivy_workflow.exists(), (
        "trivy.yml keeps repository-local SARIF reporting while providing "
        "the repository's per-PR vulnerability scan"
    )
    _assert_trivy_pull_request_contract(trivy_workflow.read_text(encoding="utf-8"))

    invalid_workflow_fixtures = {
        "target-only": """
name: trivy
on:
  push:
    branches: [develop, main]
  pull_request_target:
    branches: [develop, main]
""".strip(),
        "mixed-event": """
name: trivy
on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]
  pull_request_target:
    branches: [develop, main]
""".strip(),
        "wrong-branch": """
name: trivy
on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [feature-only]
""".strip(),
    }
    for fixture_name, workflow_fixture in invalid_workflow_fixtures.items():
        with pytest.raises(AssertionError, match=".*"):
            _assert_trivy_pull_request_contract(workflow_fixture)

    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_central"
    )
    required = {path.as_posix() for path in supply_chain.REQUIRED_FILES}
    assert ".github/workflows/dependency-review.yml" not in required
    assert ".github/workflows/codeql.yml" in required
    assert ".github/workflows/ossf-scorecard.yml" in required


def test_opencode_review_declares_top_level_token_permissions() -> None:
    """Ensure OpenCode token posture is delegated to the central required workflow."""
    policy = central_required_workflow_policy_text()

    assert_local_review_workflows_removed()
    assert "ContextualWisdomLab/.github" in policy
    assert "opencode-review" in policy
    assert "repo-local copies" in policy
    assert "token permissions" in policy


def test_supply_chain_check_rejects_unnormalized_scorecard_sarif_upload(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure Scorecard SARIF is normalized before CodeQL upload ingestion."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py", "verify_supply_chain_ossf_sarif_guard"
    )
    default_branch_ref = "format('refs/heads/{0}', github.event.repository.default_branch)"
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        "\n".join(
            [
                "name: ossf-scorecard",
                "on:",
                "  push:",
                "    branches:",
                "      - develop",
                "      - main",
                "  schedule:",
                "    - cron: '30 1 * * 1'",
                "jobs:",
                "  analysis:",
                "    name: ossf-scorecard",
                "    steps:",
                "      - uses: "
                "ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3",
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
                "      - uses: "
                "github/codeql-action/upload-sarif@95e58e9a2cdfd71adc6e0353d5c52f41a045d225",
                "        with:",
                "          sarif_file: results.sarif",
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard SARIF upload must normalize repository-level placeholder URIs "
        "before upload-sarif"
    ) in violations


def test_supply_chain_check_rejects_upload_step_with_unnormalized_scorecard_sarif(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure unrelated normalizer tokens cannot bless a raw Scorecard upload step."""
    supply_chain = load_module(
        "scripts/checks/verify_supply_chain.py",
        "verify_supply_chain_ossf_sarif_step_guard",
    )
    default_branch_ref = "format('refs/heads/{0}', github.event.repository.default_branch)"
    publish_guard = supply_chain.OSSF_DEFAULT_BRANCH_PUBLISH_GUARD.partition(": ")[2]

    workflow_dir = tmp_path / ".github" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "ossf-scorecard.yml").write_text(
        "\n".join(
            [
                "name: ossf-scorecard",
                "on:",
                "  push:",
                "    branches:",
                "      - develop",
                "      - main",
                "  schedule:",
                "    - cron: '30 1 * * 1'",
                "jobs:",
                "  analysis:",
                "    name: ossf-scorecard",
                "    steps:",
                "      - uses: "
                "ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3",
                f"        if: github.ref == {default_branch_ref}",
                "        with:",
                f"          publish_results: {publish_guard}",
                "      - name: Mention normalizer without protecting upload",
                "        env:",
                "          UNUSED_SARIF_HINT: 'sarif_file: normalized-scorecard-results.sarif'",
                "        run: >-",
                "          python3 scripts/checks/normalize_scorecard_sarif.py raw.sarif",
                "          normalized-scorecard-results.sarif",
                "      - uses: "
                "github/codeql-action/upload-sarif@95e58e9a2cdfd71adc6e0353d5c52f41a045d225",
                "        with:",
                "          sarif_file: results.sarif",
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.chdir(tmp_path)

    violations = supply_chain.verify_workflow_coverage()

    assert (
        "ossf scorecard SARIF upload must normalize repository-level placeholder URIs "
        "before upload-sarif"
    ) in violations
