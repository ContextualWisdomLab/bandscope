"""Tests for the canonical repository documentation contract."""

from pathlib import Path

import pytest
from conftest import load_module

TRACEABILITY_TABLE_HEADER = (
    "| Product requirement(s) | Technical requirement(s) | Decision/research | "
    "Module or artifact | Test/evidence | Release control |"
)


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


@pytest.mark.parametrize(
    "hidden_heading",
    ["```markdown\n## Security Notes\n```", "<!--\n## Security Notes\n-->"],
)
def test_documentation_contract_ignores_hidden_plan_security_heading(
    tmp_path: Path,
    hidden_heading: str,
) -> None:
    """Reject a plan whose only canonical-looking security heading is hidden."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_hidden_plan_security_heading",
    )
    plan = tmp_path / "docs" / "plans" / "future" / "unsafe-plan.md"
    plan.parent.mkdir(parents=True)
    plan.write_text(f"# Plan\n\n{hidden_heading}\n", encoding="utf-8")

    violations = documentation.documentation_violations(tmp_path)

    assert "docs/plans/future/unsafe-plan.md missing section: ## Security Notes" in violations


@pytest.mark.parametrize("terminator", ["# Later section", "   ## Later section", "Later\n---"])
def test_documentation_contract_requires_declared_requirement_traceability(
    tmp_path: Path,
    terminator: str,
) -> None:
    """Use real table declarations and stop trace coverage at real peer headings."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        f"verify_docs_contract_requirement_traceability_{terminator.encode().hex()}",
    )
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "PRD.md").write_text(
        """# PRD

## Product requirements

| ID | Requirement | Acceptance evidence | Status |
|---|---|---|---|
| PRD-KS-001 | Product requirement | Evidence | Active |

| PRD-KS-998 | Bare pipe prose without a delimiter row |
Historical mention PRD-KS-999 is not a declaration row.
""",
        encoding="utf-8",
    )
    (docs / "TRD.md").write_text(
        """# TRD

## Technical requirements

| ID | Requirement | Implementation or proof |
|---|---|---|
| TRD-KS-001 | Technical requirement | Proof |
""",
        encoding="utf-8",
    )
    (docs / "documentation-coverage-matrix.md").write_text(
        f"""# Matrix

```markdown
## Requirement-to-evidence traceability
| PRD-KS-001 | TRD-KS-001 |
```
<!--
## Requirement-to-evidence traceability
| PRD-KS-001 | TRD-KS-001 |
-->
## Requirement-to-evidence traceability

{TRACEABILITY_TABLE_HEADER}
|---|---|---|---|---|---|
| PRD-KS-001, PRD-KS-999 | none | Decision | Module | Evidence | Control |
| none | [link](https://example.invalid "TRD-KS-001") | Decision | Module | Evidence | Control |

Not a table.
| none | TRD-KS-001 |
```text
| none | TRD-KS-001 |
```
<!-- | none | TRD-KS-001 | -->
{terminator}

| none | TRD-KS-001 |
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/documentation-coverage-matrix.md row 1 must map plain PRD and TRD IDs",
        "docs/documentation-coverage-matrix.md row 2 must map plain PRD and TRD IDs",
        "docs/documentation-coverage-matrix.md missing requirement trace: TRD-KS-001 "
        + "(declared in docs/TRD.md)",
        "docs/documentation-coverage-matrix.md references undeclared requirement: PRD-KS-999",
    ]


def test_documentation_contract_requires_traceability_section(tmp_path: Path) -> None:
    """Reject a coverage matrix that omits its canonical traceability section."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_traceability_section",
    )
    matrix = tmp_path / "docs" / "documentation-coverage-matrix.md"
    matrix.parent.mkdir()
    matrix.write_text("# Matrix\n\nNo requirement mapping.\n", encoding="utf-8")

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/documentation-coverage-matrix.md missing section: "
        "## Requirement-to-evidence traceability"
    ]


def test_documentation_contract_rejects_swapped_requirement_families(
    tmp_path: Path,
) -> None:
    """Bind PRD/TRD declarations and traces to their canonical source and column."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_swapped_requirement_families",
    )
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "PRD.md").write_text(
        """# PRD

## Product requirements

| ID | Requirement | Acceptance evidence | Status |
|---|---|---|---|
| PRD-KS-001 | Product requirement with an escaped \\| pipe | Evidence | Active |
""",
        encoding="utf-8",
    )
    (docs / "TRD.md").write_text(
        """# TRD

## Technical requirements

| ID | Requirement | Implementation or proof |
|---|---|---|
| TRD-KS-001 | Technical requirement | Proof |
""",
        encoding="utf-8",
    )
    (docs / "documentation-coverage-matrix.md").write_text(
        f"""# Matrix

## Requirement-to-evidence traceability

{TRACEABILITY_TABLE_HEADER}
|---|---|---|---|---|---|
| TRD-KS-001 | PRD-KS-001 | Decision | Module | Evidence | Control |
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/documentation-coverage-matrix.md places TRD-KS-001 in the wrong traceability column",
        "docs/documentation-coverage-matrix.md places PRD-KS-001 in the wrong traceability column",
        "docs/documentation-coverage-matrix.md row 1 must map plain PRD and TRD IDs",
        "docs/documentation-coverage-matrix.md missing requirement trace: PRD-KS-001 "
        + "(declared in docs/PRD.md)",
        "docs/documentation-coverage-matrix.md missing requirement trace: TRD-KS-001 "
        + "(declared in docs/TRD.md)",
    ]


def test_documentation_contract_rejects_duplicate_canonical_trace_section(
    tmp_path: Path,
) -> None:
    """Reject an ambiguous matrix instead of checking only its first canonical section."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_duplicate_trace_section",
    )
    matrix = tmp_path / "docs" / "documentation-coverage-matrix.md"
    matrix.parent.mkdir()
    matrix.write_text(
        """# Matrix

## Requirement-to-evidence traceability

First section.

## Requirement-to-evidence traceability

Second section.
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/documentation-coverage-matrix.md has multiple canonical sections: "
        "## Requirement-to-evidence traceability"
    ]


def test_documentation_contract_rejects_multiple_canonical_trace_tables(
    tmp_path: Path,
) -> None:
    """Reject multiple separately rendered mapping tables under one authority heading."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_multiple_trace_tables",
    )
    matrix = tmp_path / "docs" / "documentation-coverage-matrix.md"
    matrix.parent.mkdir()
    table = f"""{TRACEABILITY_TABLE_HEADER}
|---|---|---|---|---|---|
| PRD-KS-001 | TRD-KS-001 | Decision | Module | Evidence | Control |"""
    matrix.write_text(
        f"""# Matrix

## Requirement-to-evidence traceability

{table}

{table}
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/documentation-coverage-matrix.md has multiple canonical requirement "
        "traceability tables"
    ]


def test_documentation_contract_rejects_raw_html_wrapped_trace_authority(
    tmp_path: Path,
) -> None:
    """Reject an inert or DOM-nested requirements graph wrapped in raw HTML."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_raw_html_wrapped_trace",
    )
    matrix = tmp_path / "docs" / "documentation-coverage-matrix.md"
    matrix.parent.mkdir()
    matrix.write_text(
        f"""# Matrix

<template>

## Requirement-to-evidence traceability

{TRACEABILITY_TABLE_HEADER}
|---|---|---|---|---|---|
| PRD-KS-001 | TRD-KS-001 | Decision | Module | Evidence | Control |

</template>
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/documentation-coverage-matrix.md contains unsupported raw HTML"
    ]


def test_documentation_contract_rejects_duplicate_source_id_and_incomplete_trace(
    tmp_path: Path,
) -> None:
    """Require unique declarations and all six nonempty mapping dimensions."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_duplicate_id_incomplete_trace",
    )
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "PRD.md").write_text(
        """# PRD

## Product requirements

| ID | Requirement | Acceptance evidence | Status |
|---|---|---|---|
| PRD-KS-001 | Product requirement | Evidence | Active |
| PRD-KS-001 | Duplicate requirement | Evidence | Active |
""",
        encoding="utf-8",
    )
    (docs / "TRD.md").write_text(
        """# TRD

## Technical requirements

| ID | Requirement | Implementation or proof |
|---|---|---|
| TRD-KS-001 | Technical requirement | Proof |
""",
        encoding="utf-8",
    )
    (docs / "documentation-coverage-matrix.md").write_text(
        f"""# Matrix

## Requirement-to-evidence traceability

{TRACEABILITY_TABLE_HEADER}
|---|---|---|---|---|---|
| PRD-KS-001 | TRD-KS-001 | Decision | Module | Evidence | [](#empty) |
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/PRD.md declares duplicate requirement: PRD-KS-001",
        "docs/documentation-coverage-matrix.md has incomplete traceability row: 1",
    ]


def test_documentation_contract_does_not_join_hidden_source_table_lines(
    tmp_path: Path,
) -> None:
    """Keep hidden blocks from synthesizing a requirement table header/delimiter pair."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_hidden_source_table_separator",
    )
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "PRD.md").write_text(
        """# PRD

## Product requirements

| ID | Requirement | Acceptance evidence | Status |
<!-- this hidden block must remain a table separator -->
|---|---|---|---|
| PRD-KS-001 | Product requirement | Evidence | Active |
""",
        encoding="utf-8",
    )
    (docs / "TRD.md").write_text(
        """# TRD

## Technical requirements

| ID | Requirement | Implementation or proof |
|---|---|---|
| TRD-KS-001 | Technical requirement | Proof |
""",
        encoding="utf-8",
    )
    (docs / "documentation-coverage-matrix.md").write_text(
        f"""# Matrix

## Requirement-to-evidence traceability

{TRACEABILITY_TABLE_HEADER}
|---|---|---|---|---|---|
| PRD-KS-001 | TRD-KS-001 | Decision | Module | Evidence | Control |
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/PRD.md missing canonical requirement table"
    ]


def test_documentation_contract_does_not_join_hidden_trace_table_lines(
    tmp_path: Path,
) -> None:
    """Keep fenced blocks from attaching a later paragraph to the trace table."""
    documentation = load_module(
        "scripts/checks/verify_docs.py",
        "verify_docs_contract_hidden_trace_table_separator",
    )
    matrix = tmp_path / "docs" / "documentation-coverage-matrix.md"
    matrix.parent.mkdir()
    matrix.write_text(
        f"""# Matrix

## Requirement-to-evidence traceability

{TRACEABILITY_TABLE_HEADER}
|---|---|---|---|---|---|
```text
hidden separator
```
| PRD-KS-001 | TRD-KS-001 | Decision | Module | Evidence | Control |
""",
        encoding="utf-8",
    )

    assert documentation.requirement_traceability_violations(tmp_path) == [
        "docs/documentation-coverage-matrix.md has empty canonical requirement traceability table"
    ]


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


@pytest.mark.parametrize(
    "hidden_section",
    [
        """```markdown
## Security Notes
Attack surface Trust boundary Mitigations Test points Realistic threats Remaining risk
```""",
        """<!--
## Security Notes
Attack surface Trust boundary Mitigations Test points Realistic threats Remaining risk
-->""",
        """<div>
## Security Notes
Attack surface Trust boundary Mitigations Test points Realistic threats Remaining risk
</div>""",
    ],
)
def test_security_notes_contract_ignores_hidden_canonical_opener(
    tmp_path: Path,
    hidden_section: str,
) -> None:
    """Ignore canonical-looking sections inside code fences and HTML comments."""
    hidden_kind = (
        "fence"
        if hidden_section.startswith("`")
        else "comment"
        if hidden_section.startswith("<!--")
        else "html"
    )
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_hidden_opener_{hidden_kind}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(f"# Unsafe plan\n\n{hidden_section}\n", encoding="utf-8")

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing section: ## Security Notes"
    ]


def test_security_notes_contract_rejects_rendered_duplicate_after_nested_fence(
    tmp_path: Path,
) -> None:
    """Count rendered peer headings even when list-container fence lifetimes differ."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_duplicate_after_nested_fence",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        """# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.
### Realistic threats
Artifact substitution.
### Remaining risk
Approved artifact provenance.

- item
  ```text
## Security Notes
```
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md has multiple canonical sections: ## Security Notes"
    ]


@pytest.mark.parametrize(
    ("opening", "closing"),
    [
        ("<template>", "</template>"),
        ("<details>", "</details>"),
        ("<blockquote>", "</blockquote>"),
        (
            "<!-- --><template><!-- -->",
            "<!-- --></template><!-- -->",
        ),
        (
            "<!-- --!><template><!-- -->",
            "<!-- --!></template><!-- -->",
        ),
    ],
)
def test_security_notes_contract_rejects_raw_html_wrapped_policy_section(
    tmp_path: Path,
    opening: str,
    closing: str,
) -> None:
    """Reject canonical-looking evidence made inert or DOM-nested by raw HTML."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_raw_wrapper_{opening.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        f"""# Unsafe plan

{opening}

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.
### Realistic threats
Artifact substitution.
### Remaining risk
Approved artifact provenance.

{closing}
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing section: ## Security Notes"
    ]


@pytest.mark.parametrize("separator", ["\u2028", "\v", "\f"])
def test_security_notes_contract_rejects_non_gfm_line_separator(
    tmp_path: Path,
    separator: str,
) -> None:
    """Do not treat Unicode, vertical-tab, or form-feed characters as Markdown lines."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_non_gfm_separator_{ord(separator):x}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    labels = (
        "Attack surface Trust boundary Mitigations Test points Realistic threats Remaining risk"
    )
    plan_path.write_text(
        f"# Unsafe plan{separator}## Security Notes{separator}{labels}\n",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing section: ## Security Notes"
    ]


@pytest.mark.parametrize(
    "hidden_labels",
    [
        """```text
### Attack surface
### Trust boundary
### Mitigations
### Test points
### Realistic threats
### Remaining risk
```""",
        """<!--
### Attack surface
### Trust boundary
### Mitigations
### Test points
### Realistic threats
### Remaining risk
-->""",
        """<div>
### Attack surface
### Trust boundary
### Mitigations
### Test points
### Realistic threats
### Remaining risk
</div>""",
    ],
)
def test_security_notes_contract_ignores_hidden_required_labels(
    tmp_path: Path,
    hidden_labels: str,
) -> None:
    """Require security labels in visible Markdown rather than code or comments."""
    hidden_kind = (
        "fence"
        if hidden_labels.startswith("`")
        else "comment"
        if hidden_labels.startswith("<!--")
        else "html"
    )
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_hidden_labels_{hidden_kind}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        f"# Unsafe plan\n\n## Security Notes\n\n{hidden_labels}\n",
        encoding="utf-8",
    )

    expected = [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: attack surface",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: trust boundary",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: mitigations",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: test points",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]
    if hidden_kind == "html":
        expected = ["docs/plans/nested/unsafe-plan.md missing section: ## Security Notes"]
    assert security_notes.security_notes_violations(tmp_path) == expected


def test_security_notes_contract_does_not_synthesize_headings_after_comments(
    tmp_path: Path,
) -> None:
    """Do not promote post-comment text to block headings after lexical stripping."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_comment_synthesized_headings",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    hidden_labels = "\n".join(
        f"x<!--\n-->### {label}"
        for label in (
            "Attack surface",
            "Trust boundary",
            "Mitigations",
            "Test points",
            "Realistic threats",
            "Remaining risk",
        )
    )
    plan_path.write_text(
        f"# Unsafe plan\n\n## Security Notes\n\n{hidden_labels}\n",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: attack surface",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: trust boundary",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: mitigations",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: test points",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


def test_security_notes_contract_fails_closed_when_inline_comment_hides_peer(
    tmp_path: Path,
) -> None:
    """End policy evidence before an ambiguous multiline inline-comment boundary."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_inline_comment_hides_peer",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        """# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.

text <!--
## Actual top-level peer
-->

### Realistic threats
Outside the canonical section.
### Remaining risk
Outside the canonical section.
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


def test_security_notes_contract_rejects_non_gfm_fence_closing_whitespace(
    tmp_path: Path,
) -> None:
    """Do not close a fence with Unicode whitespace that GFM does not permit."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_non_gfm_fence_close",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        """# Unsafe plan

## Security Notes

```text
``` 
### Attack surface
### Trust boundary
### Mitigations
### Test points
### Realistic threats
### Remaining risk
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: attack surface",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: trust boundary",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: mitigations",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: test points",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


@pytest.mark.parametrize("indent", ["", " ", "  ", "   "])
def test_security_notes_contract_accepts_trailing_space_and_fenced_headings(
    tmp_path: Path,
    indent: str,
) -> None:
    """Keep valid zero-to-three-space GFM fences inside the canonical section."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_fenced_headings",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "safe-plan.md"
    plan_path.parent.mkdir(parents=True)
    security_heading = "## Security Notes" + "   "
    plan_content = f"""# Safe plan

{security_heading}

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.
{indent}```text
```python
## This fenced heading is data
```
~~~text
# This fenced heading is also data
~~~
### Realistic threats
Artifact substitution.
### Remaining risk
Approved artifact provenance.

## Next section

This text is outside the security section.
"""
    plan_path.write_text(plan_content, encoding="utf-8")

    assert security_notes.security_notes_violations(tmp_path) == []
    assert "outside the security section" not in security_notes.security_notes_section(plan_content)


@pytest.mark.parametrize(
    "peer_heading",
    ["#", "##", "   #", "   ##", "# Next section", "  ## Next section"],
)
def test_security_notes_contract_stops_at_valid_atx_peer_heading(
    tmp_path: Path,
    peer_heading: str,
) -> None:
    """Treat empty and named GFM H1/H2 headings as section boundaries."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_atx_peer_{peer_heading.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_content = f"""# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.
{peer_heading}

### Realistic threats
This is outside the canonical section.
### Remaining risk
This is outside the canonical section.
"""
    plan_path.write_text(plan_content, encoding="utf-8")

    violations = security_notes.security_notes_violations(tmp_path)

    assert violations == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


@pytest.mark.parametrize("raw_peer", ["<h1>Actual peer</h1>", "<h2>Actual peer</h2>"])
def test_security_notes_contract_fails_closed_at_raw_html_peer(
    tmp_path: Path,
    raw_peer: str,
) -> None:
    """Treat rendered top-level raw HTML as an opaque policy-section boundary."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_raw_html_peer_{raw_peer.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        f"""# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.

{raw_peer}

### Realistic threats
Outside the canonical section.
### Remaining risk
Outside the canonical section.
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing section: ## Security Notes"
    ]


def test_security_notes_contract_keeps_h3_subsection_heading(tmp_path: Path) -> None:
    """Keep lower-level headings inside the canonical Security Notes section."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_h3_subsection",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "safe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        """# Safe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.
### Realistic threats
Artifact substitution.
### Remaining risk
Approved artifact provenance.
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == []


def test_security_notes_contract_rejects_list_nested_subsection_headings(
    tmp_path: Path,
) -> None:
    """Require the six canonical H3 subsections at top-level container depth."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_nested_h3_labels",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    labels = "\n".join(
        f"  ### {label}"
        for label in (
            "Attack surface",
            "Trust boundary",
            "Mitigations",
            "Test points",
            "Realistic threats",
            "Remaining risk",
        )
    )
    plan_path.write_text(
        f"# Unsafe plan\n\n## Security Notes\n\n- container\n{labels}\n",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: attack surface",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: trust boundary",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: mitigations",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: test points",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


@pytest.mark.parametrize("indent", ["    ", "\t"])
def test_security_notes_contract_rejects_invalid_fence_indentation(
    tmp_path: Path,
    indent: str,
) -> None:
    """Fail closed when an indented fence or code block can hide a peer heading."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_invalid_fence_{indent.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_content = f"""# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.
{indent}```text
   ## Next section

### Realistic threats
This is outside the canonical section.
### Remaining risk
This is outside the canonical section.
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


def test_security_notes_contract_rejects_backtick_in_fence_info(tmp_path: Path) -> None:
    """Do not open a GFM backtick fence whose info string contains a backtick."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_invalid_backtick_info",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_content = """# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.
```bad`info
## Next section

### Realistic threats
This is outside the canonical section.
### Remaining risk
This is outside the canonical section.
"""
    plan_path.write_text(plan_content, encoding="utf-8")

    violations = security_notes.security_notes_violations(tmp_path)

    assert violations == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


@pytest.mark.parametrize(
    "nested_fence",
    [
        "- item\n  ```text\n## Actual top-level peer\n```",
        "2. item\n   ~~~text\n## Actual top-level peer\n~~~",
    ],
)
def test_security_notes_contract_respects_list_nested_fence_lifetime(
    tmp_path: Path,
    nested_fence: str,
) -> None:
    """Do not let a list-child fence hide a rendered top-level peer heading."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_nested_fence_{nested_fence.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        f"""# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.

{nested_fence}

### Realistic threats
Outside the canonical section.
### Remaining risk
Outside the canonical section.
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


@pytest.mark.parametrize("underline", ["===", "   ---"])
def test_security_notes_contract_stops_at_setext_peer_heading(
    tmp_path: Path,
    underline: str,
) -> None:
    """Treat GFM Setext H1/H2 headings as canonical section boundaries."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_setext_peer_{underline.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_content = f"""# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.

Next section
{underline}

### Realistic threats
This is outside the canonical section.
### Remaining risk
This is outside the canonical section.
"""
    plan_path.write_text(plan_content, encoding="utf-8")

    violations = security_notes.security_notes_violations(tmp_path)

    assert violations == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]
    assert "next section" not in security_notes.security_notes_section(plan_content)


def test_security_notes_contract_excludes_multiline_setext_heading_labels(
    tmp_path: Path,
) -> None:
    """Exclude every line in a multiline Setext peer heading from the prior section."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_multiline_setext_peer",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        """# Unsafe plan

## Security Notes

Attack surface
Trust boundary
Mitigations
Test points
Realistic threats
Remaining risk
Next section
---
""",
        encoding="utf-8",
    )

    assert security_notes.security_notes_violations(tmp_path) == [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: attack surface",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: trust boundary",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: mitigations",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: test points",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]


@pytest.mark.parametrize(
    "peer_block",
    [
        "Next peer\n2. continuation\n---",
        "Next peer\n2) continuation\n---",
        "Next peer\n    continuation\n---",
        "Next peer\n<span>\n---",
        "Next peer\n<x-custom>\n---",
    ],
)
def test_security_notes_contract_fails_closed_at_ambiguous_setext_peer(
    tmp_path: Path,
    peer_block: str,
) -> None:
    """Do not accept H3 evidence after an ambiguous Setext or opaque block boundary."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        f"verify_security_notes_ambiguous_setext_{peer_block.encode().hex()}",
    )
    plan_path = tmp_path / "docs" / "plans" / "nested" / "unsafe-plan.md"
    plan_path.parent.mkdir(parents=True)
    plan_path.write_text(
        f"""# Unsafe plan

## Security Notes

### Attack surface
Untrusted input.
### Trust boundary
Validate before use.
### Mitigations
Fail closed.
### Test points
Exercise rejection paths.

{peer_block}

### Realistic threats
This is outside the canonical section.
### Remaining risk
This is outside the canonical section.
""",
        encoding="utf-8",
    )

    expected = [
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: realistic threats",
        "docs/plans/nested/unsafe-plan.md missing Security Notes subsection: remaining risk",
    ]
    if "<" in peer_block:
        expected = ["docs/plans/nested/unsafe-plan.md missing section: ## Security Notes"]
    assert security_notes.security_notes_violations(tmp_path) == expected


def test_security_notes_contract_accepts_checked_in_plans() -> None:
    """Accept every checked-in plan only when its complete canonical section is present."""
    security_notes = load_module(
        "scripts/checks/verify_security_notes.py",
        "verify_security_notes_repo",
    )
    repo_root = Path(__file__).resolve().parents[3]

    assert security_notes.security_notes_violations(repo_root) == []
