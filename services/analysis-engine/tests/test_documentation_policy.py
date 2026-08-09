"""Tests for the canonical repository documentation contract."""

from pathlib import Path

from conftest import load_module


def test_documentation_contract_reports_missing_canonical_authorities(tmp_path: Path) -> None:
    """Reject a repository that omits the PRD, TRD, ADR index, or diagram authority."""
    documentation = load_module("scripts/checks/verify_docs.py", "verify_docs_contract_missing")

    violations = documentation.documentation_violations(tmp_path)

    assert "missing file: docs/PRD.md" in violations
    assert "missing file: docs/TRD.md" in violations
    assert "missing file: docs/adr/README.md" in violations
    assert "missing file: docs/architecture/diagrams.md" in violations
    assert "missing file: docs/documentation-coverage-matrix.md" in violations


def test_documentation_contract_accepts_checked_in_authorities() -> None:
    """Accept the checked-in documentation graph when every canonical authority is present."""
    documentation = load_module("scripts/checks/verify_docs.py", "verify_docs_contract_repo")
    repo_root = Path(__file__).resolve().parents[3]

    assert documentation.documentation_violations(repo_root) == []


def test_documentation_contract_checks_every_nested_plan_security_section(
    tmp_path: Path,
) -> None:
    """Reject newly added plan documents that omit their security boundary."""
    documentation = load_module("scripts/checks/verify_docs.py", "verify_docs_contract_nested_plan")
    plan = tmp_path / "docs" / "plans" / "future" / "unsafe-plan.md"
    plan.parent.mkdir(parents=True)
    plan.write_text("# Plan\n\nNo trust-boundary analysis yet.\n", encoding="utf-8")

    violations = documentation.documentation_violations(tmp_path)

    assert "docs/plans/future/unsafe-plan.md missing section: Security Notes" in violations
