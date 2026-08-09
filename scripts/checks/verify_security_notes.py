"""Verify that every design plan has one complete canonical security section."""

import re
from pathlib import Path

SECURITY_NOTES_HEADING = "## Security Notes"
SECURITY_NOTES_PATTERN = re.compile(r"^## Security Notes\s*$")
PEER_HEADING_PATTERN = re.compile(r"^ {0,3}#{1,2}\s+.+\s*$")
FENCE_PATTERN = re.compile(r"^ {0,3}(?P<marker>`{3,}|~{3,})")
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
    start = next(
        (
            index
            for index, line in enumerate(lines)
            if SECURITY_NOTES_PATTERN.fullmatch(line)
        ),
        None,
    )
    if start is None:
        return ""

    section_lines = [lines[start]]
    open_fence: tuple[str, int] | None = None
    for line in lines[start + 1 :]:
        fence_match = FENCE_PATTERN.match(line)
        if fence_match is not None:
            marker = fence_match.group("marker")
            marker_shape = (marker[0], len(marker))
            if open_fence is None:
                open_fence = marker_shape
            elif (
                marker_shape[0] == open_fence[0]
                and marker_shape[1] >= open_fence[1]
                and not line[fence_match.end() :].strip()
            ):
                open_fence = None
        elif open_fence is None and PEER_HEADING_PATTERN.fullmatch(line):
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
