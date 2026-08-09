"""Tests for the canonical repository documentation contract."""

from pathlib import Path

import pytest
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
    """Reject newly added plan documents that omit their canonical security boundary."""
    documentation = load_module("scripts/checks/verify_docs.py", "verify_docs_contract_nested_plan")
    plan = tmp_path / "docs" / "plans" / "future" / "unsafe-plan.md"
    plan.parent.mkdir(parents=True)
    plan.write_text("# Plan\n\nNo trust-boundary analysis yet.\n", encoding="utf-8")

    violations = documentation.documentation_violations(tmp_path)

    assert "docs/plans/future/unsafe-plan.md missing section: ## Security Notes" in violations


def test_security_notes_contract_discovers_nested_plan_without_canonical_section(
    tmp_path: Path,
) -> None:
    """Reject nested plan documents that omit the canonical Security Notes section."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_nested_plan",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "new-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        "# New plan\n\nSecurity Notes are considered elsewhere.\n",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/new-plan.md missing section: ## Security Notes"
    ]


def test_security_notes_contract_accepts_trailing_space_and_fenced_headings(
    tmp_path: Path,
) -> None:
    """Keep fenced headings inside a canonical section with trailing whitespace."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_fenced_headings",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "safe-plan.md"
    plan_path.parent.mkdir(parents=True)
    security_heading = "## Security Notes" + "   "
    plan_content = f"""# Safe plan

{security_heading}

Attack surface: untrusted input.
Trust boundary: validate before use.
Mitigations: fail closed.
Test points: exercise rejection paths.
   ```text
```python
## This fenced heading is data
```
~~~text
# This fenced heading is also data
~~~
Realistic threats: artifact substitution.
Remaining risk: approved artifact provenance.

## Next section

This text is outside the security section.
"""
    plan_path.write_text(plan_content, encoding="utf-8")

    assert security_notes.security_notes_violations(tmp_path) == []
    assert "outside the security section" not in security_notes.security_notes_section(plan_content)


@pytest.mark.parametrize("indent", ["    ", "\t"])
def test_security_notes_contract_rejects_invalid_fence_indentation(
    tmp_path: Path,
    indent: str,
) -> None:
    """Do not let an indented code block hide the next peer heading."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_invalid_fence_{indent.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_content = f"""# Unsafe plan

## Security Notes

Attack surface: untrusted input.
Trust boundary: validate before use.
Mitigations: fail closed.
Test points: exercise rejection paths.
{indent}```text
   ## Next section

Realistic threats: this is outside the canonical section.
Remaining risk: this is outside the canonical section.
"""
    plan_path.write_text(plan_content, encoding="utf-8")

    violations = security_notes.security_notes_violations(tmp_path)

    assert violations == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]
    assert "outside the canonical section" not in security_notes.security_notes_section(
        plan_content
    )


def test_security_notes_contract_accepts_checked_in_plans() -> None:
    """Accept every checked-in plan only when its complete canonical section is present."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_repo",
    )
    repo_root = Path(__file__).resolve().parents[3]

    assert security_notes.security_notes_violations(repo_root) == []
