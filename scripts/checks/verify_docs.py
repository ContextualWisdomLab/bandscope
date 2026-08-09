"""Verify that required repository documentation files and references exist."""

import re
from pathlib import Path

from markdown_sections import (
    MarkdownDocument,
    MarkdownHeading,
    MarkdownTable,
    scan_markdown,
    section_tables,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REQUIREMENT_ID_PATTERN = re.compile(r"\b(?:PRD|TRD)-KS-\d{3}\b")
PRODUCT_REQUIREMENT_ID_PATTERN = re.compile(r"PRD-KS-\d{3}")
TECHNICAL_REQUIREMENT_ID_PATTERN = re.compile(r"TRD-KS-\d{3}")
SECURITY_NOTES_HEADING_PATTERN = re.compile(r"^## Security Notes[ \t]*$")
TRACEABILITY_HEADING = "## Requirement-to-evidence traceability"
TRACEABILITY_HEADERS = (
    "Product requirement(s)",
    "Technical requirement(s)",
    "Decision/research",
    "Module or artifact",
    "Test/evidence",
    "Release control",
)
TRACEABILITY_MATRIX = Path("docs/documentation-coverage-matrix.md")
TRACEABILITY_SOURCES = {
    Path("docs/PRD.md"): (
        "Product requirements",
        PRODUCT_REQUIREMENT_ID_PATTERN,
        ("ID", "Requirement", "Acceptance evidence", "Status"),
    ),
    Path("docs/TRD.md"): (
        "Technical requirements",
        TECHNICAL_REQUIREMENT_ID_PATTERN,
        ("ID", "Requirement", "Implementation or proof"),
    ),
}

REQUIRED_PATHS = [
    Path("README.md"),
    Path("LICENSE"),
    Path("CONTRIBUTING.md"),
    Path("CODE_OF_CONDUCT.md"),
    Path("AGENTS.md"),
    Path("ARCHITECTURE.md"),
    Path("SECURITY.md"),
    Path("docs/brand-story.md"),
    Path("docs/repository/governance.md"),
    Path("docs/repository/bootstrap-plan.md"),
    Path("docs/repository/gitflow.md"),
    Path("docs/architecture/overview.md"),
    Path("docs/architecture/diagrams.md"),
    Path("docs/README.md"),
    Path("docs/PRD.md"),
    Path("docs/TRD.md"),
    Path("docs/adr/README.md"),
    Path("docs/adr/0001-source-separation-runtime-and-model-delivery.md"),
    Path("docs/adr/0002-known-stem-youtube-quality-gate.md"),
    Path("docs/adr/0003-ephemeral-benchmark-evidence-model.md"),
    Path("docs/documentation-coverage-matrix.md"),
    Path("docs/doctoring/real-audio-accuracy-acceptance.md"),
    Path("docs/i18n/i18n-policy.md"),
    Path("docs/release/release-policy.md"),
    Path(".github/CODEOWNERS"),
    Path(".github/PULL_REQUEST_TEMPLATE.md"),
    Path(".github/ISSUE_TEMPLATE/bug_report.yml"),
    Path(".github/ISSUE_TEMPLATE/feature_request.yml"),
    Path(".github/ISSUE_TEMPLATE/config.yml"),
    Path("docs/security/app-security.md"),
    Path("docs/security/dependency-policy.md"),
    Path("docs/security/sbom-policy.md"),
    Path("docs/security/code-security.md"),
    Path("docs/security/cross-platform-build-policy.md"),
    Path("docs/security/github-required-checks.md"),
    Path("docs/workflow/github-bootstrap-execution-policy.md"),
    Path("docs/plans/2026-03-10-bandscope-harness-design.md"),
    Path("docs/plans/2026-03-10-bandscope-harness.md"),
    Path("docs/plans/2026-03-10-bandscope-supply-chain-design.md"),
    Path("docs/plans/2026-03-10-bandscope-supply-chain.md"),
    Path("docs/plans/2026-03-10-bandscope-cross-platform-build-design.md"),
    Path("docs/plans/2026-03-10-bandscope-cross-platform-build.md"),
]

REQUIRED_REFERENCES = {
    Path("CONTRIBUTING.md"): ["docs/security/github-required-checks.md"],
    Path("README.md"): [
        "docs/security/app-security.md",
        "docs/security/dependency-policy.md",
        "docs/repository/gitflow.md",
        "docs/security/cross-platform-build-policy.md",
        "docs/workflow/github-bootstrap-execution-policy.md",
    ],
    Path("AGENTS.md"): [
        "docs/security/app-security.md",
        "docs/security/dependency-policy.md",
        "docs/security/cross-platform-build-policy.md",
        "docs/workflow/github-bootstrap-execution-policy.md",
        "Security Notes",
    ],
    Path("ARCHITECTURE.md"): [
        "docs/security/app-security.md",
        "docs/security/dependency-policy.md",
        "docs/security/cross-platform-build-policy.md",
        "docs/workflow/github-bootstrap-execution-policy.md",
        "docs/PRD.md",
        "docs/TRD.md",
        "docs/adr/README.md",
        "docs/architecture/diagrams.md",
    ],
    Path("docs/README.md"): [
        "docs/PRD.md",
        "docs/TRD.md",
        "docs/adr/README.md",
        "docs/architecture/diagrams.md",
        "docs/documentation-coverage-matrix.md",
    ],
    Path("docs/repository/bootstrap-plan.md"): [
        "docs/security/github-required-checks.md"
    ],
    Path("docs/repository/gitflow.md"): ["docs/security/github-required-checks.md"],
    Path("docs/repository/governance.md"): ["docs/security/github-required-checks.md"],
    Path("docs/security/github-required-checks.md"): [
        "## Review-equivalent evidence",
        "exact current PR head SHA",
        "independent non-author",
        "Status contexts, check runs, reactions, issue comments",
        "defer that merge",
    ],
    Path("docs/workflow/github-bootstrap-execution-policy.md"): [
        "docs/security/github-required-checks.md"
    ],
}


def _plain_requirement_ids(
    cell: str,
    expected_pattern: re.Pattern[str],
) -> tuple[set[str], set[str]]:
    """Return expected IDs and plain IDs from the wrong requirement family."""
    requirement_ids: set[str] = set()
    wrong_family_ids: set[str] = set()
    for token in (item.strip(" \t") for item in cell.split(",")):
        if expected_pattern.fullmatch(token):
            requirement_ids.add(token)
        elif REQUIREMENT_ID_PATTERN.fullmatch(token):
            wrong_family_ids.add(token)
    return requirement_ids, wrong_family_ids


def _canonical_tables(
    document: MarkdownDocument,
    heading: MarkdownHeading,
    expected_headers: tuple[str, ...],
) -> list[MarkdownTable]:
    """Return exact-header rendered tables using canonical outer-pipe source."""
    return [
        table
        for table in section_tables(document, heading)
        if table.headers == expected_headers
        and table.source_headers == expected_headers
        and table.canonical_outer_pipe
        and not table.contains_html
    ]


def _canonical_h2_headings(
    document: MarkdownDocument,
    heading_text: str,
) -> list[MarkdownHeading]:
    """Return exact column-zero canonical H2 headings from a scanned document."""
    return [
        heading
        for heading in document.headings
        if heading.level == 2
        and heading.text == heading_text
        and document.lines[heading.start].rstrip(" \t") == f"## {heading_text}"
    ]


def requirement_traceability_violations(root: Path = Path(".")) -> list[str]:
    """Return missing and undeclared requirement IDs in the traceability matrix."""
    matrix_path = root / TRACEABILITY_MATRIX
    if not matrix_path.exists():
        return []
    matrix_content = matrix_path.read_text(encoding="utf-8")
    matrix_document = scan_markdown(matrix_content)
    if matrix_document.has_unsafe_html:
        return [f"{TRACEABILITY_MATRIX} contains unsupported raw HTML"]
    matrix_headings = _canonical_h2_headings(
        matrix_document,
        "Requirement-to-evidence traceability",
    )
    if not matrix_headings:
        return [f"{TRACEABILITY_MATRIX} missing section: {TRACEABILITY_HEADING}"]
    if len(matrix_headings) != 1:
        return [
            f"{TRACEABILITY_MATRIX} has multiple canonical sections: "
            f"{TRACEABILITY_HEADING}"
        ]
    matrix_heading = matrix_headings[0]
    traceability_tables = _canonical_tables(
        matrix_document,
        matrix_heading,
        TRACEABILITY_HEADERS,
    )
    if not traceability_tables:
        return [
            f"{TRACEABILITY_MATRIX} missing canonical requirement traceability table"
        ]
    if len(traceability_tables) != 1:
        return [
            f"{TRACEABILITY_MATRIX} has multiple canonical requirement "
            "traceability tables"
        ]
    traceability_rows = traceability_tables[0].rows
    traceability_source_rows = traceability_tables[0].source_rows
    if not traceability_rows:
        return [
            f"{TRACEABILITY_MATRIX} has empty canonical requirement traceability table"
        ]

    declared_by_source: dict[Path, set[str]] = {}
    violations: list[str] = []
    source_structure_valid = True
    for source, (
        requirement_heading,
        requirement_pattern,
        requirement_headers,
    ) in TRACEABILITY_SOURCES.items():
        source_path = root / source
        if source_path.exists():
            source_document = scan_markdown(source_path.read_text(encoding="utf-8"))
            if source_document.has_unsafe_html:
                violations.append(f"{source} contains unsupported raw HTML")
                source_structure_valid = False
                continue
            source_headings = _canonical_h2_headings(
                source_document,
                requirement_heading,
            )
            if not source_headings:
                violations.append(f"{source} missing section: ## {requirement_heading}")
                source_structure_valid = False
                continue
            if len(source_headings) != 1:
                violations.append(
                    f"{source} has multiple canonical sections: ## {requirement_heading}"
                )
                source_structure_valid = False
                continue
            source_heading = source_headings[0]
            requirement_tables = _canonical_tables(
                source_document,
                source_heading,
                requirement_headers,
            )
            if not requirement_tables:
                violations.append(f"{source} missing canonical requirement table")
                source_structure_valid = False
                continue
            if len(requirement_tables) != 1:
                violations.append(f"{source} has multiple canonical requirement tables")
                source_structure_valid = False
                continue
            requirement_rows = requirement_tables[0].rows
            requirement_source_rows = requirement_tables[0].source_rows
            if not requirement_rows:
                violations.append(f"{source} has empty canonical requirement table")
                source_structure_valid = False
                continue
            declared_ids: set[str] = set()
            for row_number, (row, source_row) in enumerate(
                zip(requirement_rows, requirement_source_rows, strict=True),
                start=1,
            ):
                if any(not cell for cell in row):
                    violations.append(
                        f"{source} has incomplete canonical requirement row: {row_number}"
                    )
                requirement_id = source_row[0]
                if requirement_pattern.fullmatch(requirement_id):
                    if requirement_id in declared_ids:
                        violations.append(
                            f"{source} declares duplicate requirement: {requirement_id}"
                        )
                    declared_ids.add(requirement_id)
                else:
                    violations.append(
                        f"{source} has invalid requirement-table ID: {requirement_id}"
                    )
            declared_by_source[source] = declared_ids

    if not source_structure_valid:
        return violations

    declared = (
        set().union(*declared_by_source.values()) if declared_by_source else set()
    )
    traced: set[str] = set()
    trace_patterns = (
        PRODUCT_REQUIREMENT_ID_PATTERN,
        TECHNICAL_REQUIREMENT_ID_PATTERN,
    )
    for row_number, (row, source_row) in enumerate(
        zip(traceability_rows, traceability_source_rows, strict=True),
        start=1,
    ):
        if any(not cell for cell in row):
            violations.append(
                f"{TRACEABILITY_MATRIX} has incomplete traceability row: {row_number}"
            )
        row_requirement_ids: list[set[str]] = []
        for column, pattern in enumerate(trace_patterns):
            requirement_ids, wrong_family_ids = _plain_requirement_ids(
                source_row[column], pattern
            )
            row_requirement_ids.append(requirement_ids)
            traced.update(requirement_ids)
            for requirement_id in sorted(wrong_family_ids):
                violations.append(
                    f"{TRACEABILITY_MATRIX} places {requirement_id} in the wrong "
                    "traceability column"
                )
        if any(not requirement_ids for requirement_ids in row_requirement_ids):
            violations.append(
                f"{TRACEABILITY_MATRIX} row {row_number} must map plain PRD and TRD IDs"
            )
    for source, requirement_ids in declared_by_source.items():
        for requirement_id in sorted(requirement_ids - traced):
            violations.append(
                f"{TRACEABILITY_MATRIX} missing requirement trace: {requirement_id} "
                f"(declared in {source})"
            )
    for requirement_id in sorted(traced - declared):
        violations.append(
            f"{TRACEABILITY_MATRIX} references undeclared requirement: {requirement_id}"
        )
    return violations


def documentation_violations(root: Path = Path(".")) -> list[str]:
    """Return missing canonical files and broken authority-reference violations."""
    violations = [
        f"missing file: {path}" for path in REQUIRED_PATHS if not (root / path).exists()
    ]
    for path, required_texts in REQUIRED_REFERENCES.items():
        absolute_path = root / path
        if not absolute_path.exists():
            continue
        content = absolute_path.read_text(encoding="utf-8")
        for required_text in required_texts:
            if required_text not in content:
                violations.append(f"{path} missing reference: {required_text}")
    plans_root = root / "docs" / "plans"
    if plans_root.exists():
        for absolute_path in sorted(plans_root.rglob("*.md")):
            content = absolute_path.read_text(encoding="utf-8")
            document = scan_markdown(content)
            has_security_heading = (
                any(
                    heading.level == 2
                    and heading.text == "Security Notes"
                    and SECURITY_NOTES_HEADING_PATTERN.fullmatch(
                        document.lines[heading.start]
                    )
                    for heading in document.headings
                )
                and not document.has_unsafe_html
            )
            if not has_security_heading:
                relative_path = absolute_path.relative_to(root)
                violations.append(f"{relative_path} missing section: ## Security Notes")
    violations.extend(requirement_traceability_violations(root))
    return violations


def main() -> int:
    """Return a failing exit code when required docs or references are missing."""
    violations = documentation_violations(REPO_ROOT)

    if violations:
        print("Documentation check failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Documentation check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
