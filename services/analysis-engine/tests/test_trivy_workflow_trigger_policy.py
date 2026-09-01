"""Structural security-policy tests for the repository-local Trivy workflow triggers."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_TRIVY_WORKFLOW_PATH = _REPOSITORY_ROOT / ".github" / "workflows" / "trivy.yml"
_EXPECTED_PULL_REQUEST_BRANCHES = frozenset({"develop", "main"})


def _workflow_trigger_mapping(workflow_text: str) -> dict[str, object]:
    """Return the structurally parsed GitHub Actions trigger mapping."""
    workflow_document = yaml.safe_load(workflow_text)
    assert isinstance(workflow_document, dict), "workflow document must be a mapping"

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


def test_repository_trivy_workflow_uses_safe_pull_request_triggers() -> None:
    """Ensure the checked-in Trivy workflow satisfies the structural trigger contract."""
    _assert_trivy_pull_request_policy(_TRIVY_WORKFLOW_PATH.read_text(encoding="utf-8"))


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
