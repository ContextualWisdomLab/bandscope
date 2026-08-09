"""Verify that every design plan has one complete canonical security section."""

import re
from pathlib import Path

SECURITY_NOTES_HEADING = "## Security Notes"
PLAN_DIR = Path("docs/plans")
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
    "realistic threats",
    "remaining risk",
]


def security_notes_section(content: str) -> str:
    """Return the canonical security section, stopping at the next peer heading."""
    lines = content.splitlines()
    try:
        start = lines.index(SECURITY_NOTES_HEADING)
    except ValueError:
        return ""

    section_lines = [lines[start]]
    for line in lines[start + 1 :]:
        if re.fullmatch(r"#{1,2}\s+.+", line):
            break
        section_lines.append(line)
    return "\n".join(section_lines).lower()


def security_notes_violations(repo_root: Path = Path(".")) -> list[str]:
    """Return missing-section and incomplete-section violations below ``repo_root``."""
    violations: list[str] = []
    plan_dir = repo_root / PLAN_DIR
    for path in sorted(plan_dir.rglob("*.md")):
        content = path.read_text(encoding="utf-8")
        section = security_notes_section(content)
        display_path = path.relative_to(repo_root).as_posix()
        if not section:
            violations.append(
                f"{display_path} missing section: {SECURITY_NOTES_HEADING}"
            )
            continue
        for subsection in REQUIRED_SUBSECTIONS:
            if subsection not in section:
                violations.append(
                    f"{display_path} missing Security Notes subsection: {subsection}"
                )
    return violations


def main() -> int:
    """Return a failing exit code when Security Notes or required subsections are missing."""
    violations = security_notes_violations()
    if violations:
        print("Missing Security Notes section in:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Security Notes check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
