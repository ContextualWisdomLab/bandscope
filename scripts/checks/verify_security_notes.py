"""Verify that every design plan has one complete canonical security section."""

import re
from pathlib import Path

from markdown_sections import scan_markdown, section_end, section_text

REPO_ROOT = Path(__file__).resolve().parents[2]
SECURITY_NOTES_HEADING = "## Security Notes"
SECURITY_NOTES_PATTERN = re.compile(r"^## Security Notes[ \t]*$")
PLAN_DIR = Path("docs/plans")
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
    "realistic threats",
    "remaining risk",
]


def _security_notes_contract(content: str) -> tuple[str, set[str], bool]:
    """Return canonical section text, H3 names, and duplicate-section state."""
    document = scan_markdown(content)
    if document.has_unsafe_html:
        return "", set(), False
    headings = [
        candidate
        for candidate in document.headings
        if candidate.level == 2
        and candidate.text == "Security Notes"
        and SECURITY_NOTES_PATTERN.fullmatch(document.lines[candidate.start])
    ]
    if len(headings) != 1:
        return "", set(), len(headings) > 1
    heading = headings[0]
    end = section_end(document, heading)
    subsections = {
        candidate.text.strip().lower()
        for candidate in document.headings
        if candidate.level == 3
        and heading.end <= candidate.start < end
        and document.lines[candidate.start].rstrip(" \t") == f"### {candidate.text}"
    }
    section = f"{SECURITY_NOTES_HEADING}\n{section_text(document, heading)}".lower()
    return section, subsections, False


def security_notes_section(content: str) -> str:
    """Return the visible canonical security section up to the next peer heading."""
    section, _, _ = _security_notes_contract(content)
    return section


def security_notes_violations(repo_root: Path = Path(".")) -> list[str]:
    """Return missing-section and incomplete-section violations below ``repo_root``."""
    violations: list[str] = []
    plan_dir = repo_root / PLAN_DIR
    for path in sorted(plan_dir.rglob("*.md")):
        content = path.read_text(encoding="utf-8")
        section, subsections, duplicate_section = _security_notes_contract(content)
        display_path = path.relative_to(repo_root).as_posix()
        if duplicate_section:
            violations.append(
                f"{display_path} has multiple canonical sections: {SECURITY_NOTES_HEADING}"
            )
            continue
        if not section:
            violations.append(
                f"{display_path} missing section: {SECURITY_NOTES_HEADING}"
            )
            continue
        for subsection in REQUIRED_SUBSECTIONS:
            if subsection not in subsections:
                violations.append(
                    f"{display_path} missing Security Notes subsection: {subsection}"
                )
    return violations


def main() -> int:
    """Return a failing exit code when Security Notes or required subsections are missing."""
    violations = security_notes_violations(REPO_ROOT)
    if violations:
        print("Missing Security Notes section in:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Security Notes check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
