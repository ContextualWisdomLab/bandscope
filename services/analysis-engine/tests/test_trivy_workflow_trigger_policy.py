"""Structural security-policy tests for the repository-local Trivy workflow triggers."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_TRIVY_WORKFLOW_PATH = _REPOSITORY_ROOT / ".github" / "workflows" / "trivy.yml"
_EXPECTED_PULL_REQUEST_BRANCHES = frozenset({"develop", "main"})


def _workflow_document(workflow_text: str) -> dict[str, object]:
    """Return the structurally parsed GitHub Actions workflow document."""
    workflow_document = yaml.safe_load(workflow_text)
    assert isinstance(workflow_document, dict), "workflow document must be a mapping"
    return workflow_document


def _workflow_trigger_mapping(workflow_text: str) -> dict[str, object]:
    """Return the structurally parsed GitHub Actions trigger mapping."""
    workflow_document = _workflow_document(workflow_text)

    workflow_triggers = workflow_document.get("on")
    if workflow_triggers is None:
        # PyYAML's YAML 1.1 resolver interprets the unquoted GitHub key `on` as True.
        workflow_triggers = workflow_document.get(True)
    assert isinstance(workflow_triggers, dict), "workflow on block must be a mapping"
    return workflow_triggers


def _assert_trivy_pull_request_policy(workflow_text: str) -> None:
    """Require ordinary PR coverage and reject privileged target-context execution."""
    workflow_triggers = _workflow_trigger_mapping(workflow_text)
    assert "push" in workflow_triggers, "Trivy must retain push-based SARIF reporting"
    assert "pull_request_target" not in workflow_triggers, (
        "Trivy must not execute PR-controlled code through pull_request_target"
    )

    pull_request_settings = workflow_triggers.get("pull_request")
    assert isinstance(pull_request_settings, dict), (
        "Trivy must scan pull-request heads through the ordinary pull_request event"
    )
    configured_branches = pull_request_settings.get("branches")
    assert isinstance(configured_branches, list), "pull_request.branches must be a list"
    configured_branch_names = {str(branch_name) for branch_name in configured_branches}
    assert _EXPECTED_PULL_REQUEST_BRANCHES.issubset(configured_branch_names), (
        "Trivy pull_request coverage must include develop and main"
    )


def _assert_trivy_concurrency_policy(workflow_text: str) -> None:
    """Require PR-stable cancellation so predecessor scans cannot saturate runners."""
    workflow_document = _workflow_document(workflow_text)
    concurrency_settings = workflow_document.get("concurrency")
    assert isinstance(
        concurrency_settings, dict
    ), "Trivy must declare workflow-level concurrency"
    concurrency_group = concurrency_settings.get("group")
    assert isinstance(
        concurrency_group, str
    ), "Trivy concurrency.group must be a string"
    assert "github.repository" in concurrency_group, (
        "Trivy concurrency must be repository-scoped"
    )
    assert "github.event.pull_request.number" in concurrency_group, (
        "Trivy PR concurrency must be stable across head-SHA changes"
    )
    assert "github.sha" not in concurrency_group and "head.sha" not in concurrency_group, (
        "Trivy concurrency must not preserve stale runs by keying on the head SHA"
    )
    assert concurrency_settings.get("cancel-in-progress") is True, (
        "Trivy must cancel superseded predecessor scans"
    )


def test_repository_trivy_workflow_uses_safe_pull_request_triggers() -> None:
    """Ensure the checked-in Trivy workflow satisfies the structural trigger contract."""
    workflow_text = _TRIVY_WORKFLOW_PATH.read_text(encoding="utf-8")
    _assert_trivy_pull_request_policy(workflow_text)
    _assert_trivy_concurrency_policy(workflow_text)


@pytest.mark.parametrize(
    ("fixture_name", "workflow_fixture"),
    [
        (
            "target-only",
            """
name: trivy
on:
  push:
    branches: [develop, main]
  pull_request_target:
    branches: [develop, main]
""".strip(),
        ),
        (
            "mixed-event",
            """
name: trivy
on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, main]
  pull_request_target:
    branches: [develop, main]
""".strip(),
        ),
        (
            "wrong-branch",
            """
name: trivy
on:
  push:
    branches: [develop, main]
  pull_request:
    branches: [develop, release]
""".strip(),
        ),
    ],
)
def test_trivy_workflow_rejects_unsafe_pull_request_trigger_fixtures(
    fixture_name: str,
    workflow_fixture: str,
) -> None:
    """Reject target-context and wrong-branch workflows by parsed YAML structure."""
    with pytest.raises(AssertionError), pytest.MonkeyPatch.context() as patch_context:
        # Keep the fixture name visible in pytest failure context without changing policy behavior.
        patch_context.setenv("BANDSCOPE_TRIVY_POLICY_FIXTURE", fixture_name)
        _assert_trivy_pull_request_policy(workflow_fixture)


@pytest.mark.parametrize(
    "workflow_fixture",
    [
        """
name: trivy
concurrency:
  group: trivy-${{ github.repository }}-${{ github.sha }}
  cancel-in-progress: true
""".strip(),
        """
name: trivy
concurrency:
  group: trivy-${{ github.repository }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: false
""".strip(),
    ],
)
def test_trivy_workflow_rejects_stale_run_concurrency_fixtures(
    workflow_fixture: str,
) -> None:
    """Reject SHA-keyed or non-cancelling concurrency that preserves obsolete runs."""
    with pytest.raises(AssertionError):
        _assert_trivy_concurrency_policy(workflow_fixture)
