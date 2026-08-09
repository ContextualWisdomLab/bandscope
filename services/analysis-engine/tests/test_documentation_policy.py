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
