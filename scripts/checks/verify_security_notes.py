"""Verify Security Notes requirements for plans and selected doctoring evidence."""

import re
from pathlib import Path

SECURITY_NOTES_TEXT = "Security Notes"
DOCTORING_SECURITY_NOTES_HEADING = "## Security Notes"
DOCTORING_TRUST_BOUNDARY_HEADING = "### Trust boundary"
PLAN_DIR = Path("docs/plans")
DOCTORING_DIR = Path("docs/doctoring")
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
    "realistic threats",
    "remaining risk",
]
FENCE_OPEN_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")

# Doctoring documents are opt-in because the six-subsection design-plan template is
# not meaningful for every research or implementation note. A registry entry is the
# machine-readable marker that a reviewed external-reference/trust-boundary claim
# must keep a Security Notes section. Entries may precede the dependent document's
# protected integration; absent files are therefore ignored until they exist.
DOCTORING_SECURITY_NOTES_REQUIRED = frozenset(
    {
        "sidebar-disabled-tooltips.md",
    }
)


def security_notes_section(content: str) -> str:
    """Extract the lowercased Security Notes section from a plan document."""
    lowered = content.lower()
    marker = SECURITY_NOTES_TEXT.lower()
    start = lowered.find(marker)
    if start == -1:
        return ""

    end_candidates = []
    for delimiter in ["\n---", "\n## approaches considered", "\n## decision"]:
        end = lowered.find(delimiter, start + len(marker))
        if end != -1:
            end_candidates.append(end)

    if not end_candidates:
        return lowered[start:]

    return lowered[start : min(end_candidates)]


def _remove_html_comment_content(line: str, in_comment: bool) -> tuple[str, bool]:
    """Remove hidden HTML-comment spans while preserving visible text on the line."""
    visible_parts: list[str] = []
    cursor = 0

    while cursor < len(line):
        if in_comment:
            end = line.find("-->", cursor)
            if end == -1:
                return "".join(visible_parts), True
            in_comment = False
            cursor = end + 3
            continue

        start = line.find("<!--", cursor)
        if start == -1:
            visible_parts.append(line[cursor:])
            break

        visible_parts.append(line[cursor:start])
        end = line.find("-->", start + 4)
        if end == -1:
            in_comment = True
            break
        cursor = end + 3

    return "".join(visible_parts), in_comment


def doctoring_markdown_lines(content: str) -> list[str]:
    """Return rendered doctoring lines with code and HTML comments removed."""
    visible: list[str] = []
    fence_character = ""
    fence_length = 0
    in_html_comment = False

    for raw_line in content.splitlines():
        if fence_character:
            stripped = raw_line.lstrip(" ")
            indent = len(raw_line) - len(stripped)
            closing = stripped.strip()
            if (
                indent <= 3
                and len(closing) >= fence_length
                and set(closing) == {fence_character}
            ):
                fence_character = ""
                fence_length = 0
            continue

        line, in_html_comment = _remove_html_comment_content(raw_line, in_html_comment)
        if not line:
            continue

        fence_match = FENCE_OPEN_RE.match(line)
        if fence_match:
            marker = fence_match.group(1)
            fence_character = marker[0]
            fence_length = len(marker)
            continue

        if line.startswith("\t") or line.startswith("    "):
            continue
        visible.append(line)

    return visible


def doctoring_security_notes_section(content: str) -> str:
    """Return only the body of an explicit level-two doctoring Security Notes heading."""
    lines = doctoring_markdown_lines(content)
    heading = DOCTORING_SECURITY_NOTES_HEADING.casefold()
    for index, line in enumerate(lines):
        if line.strip().casefold() != heading:
            continue
        section_lines: list[str] = []
        for candidate in lines[index + 1 :]:
            if candidate.strip().startswith("## "):
                break
            section_lines.append(candidate)
        return "\n".join(section_lines)
    return ""


def doctoring_trust_boundary_statement(section: str) -> str:
    """Return substantive prose owned by an explicit doctoring Trust boundary subsection."""
    lines = section.splitlines()
    heading = DOCTORING_TRUST_BOUNDARY_HEADING.casefold()
    for index, line in enumerate(lines):
        if line.strip().casefold() != heading:
            continue
        statement_lines: list[str] = []
        for candidate in lines[index + 1 :]:
            if candidate.strip().startswith("#"):
                break
            if candidate.strip():
                statement_lines.append(candidate.strip())
        statement = " ".join(statement_lines)
        words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'/-]*", statement)
        if len(words) >= 5 and statement.rstrip().endswith((".", "!", "?")):
            return statement
        return ""
    return ""


def find_security_notes_violations(
    plan_dir: Path = PLAN_DIR,
    doctoring_dir: Path = DOCTORING_DIR,
) -> list[str]:
    """Return deterministic plan and registered-doctoring Security Notes violations."""
    missing: list[str] = []

    for path in sorted(plan_dir.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        if SECURITY_NOTES_TEXT not in content:
            missing.append(str(path))
            continue
        lowered = security_notes_section(content)
        for subsection in REQUIRED_SUBSECTIONS:
            if subsection not in lowered:
                missing.append(f"{path} missing subsection: {subsection}")

    for file_name in sorted(DOCTORING_SECURITY_NOTES_REQUIRED):
        path = doctoring_dir / file_name
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8")
        section = doctoring_security_notes_section(content)
        if not section:
            missing.append(str(path))
            continue
        if not doctoring_trust_boundary_statement(section):
            missing.append(f"{path} missing Security Notes trust-boundary statement")

    return missing


def main() -> int:
    """Return a failing exit code when governed Security Notes evidence is incomplete."""
    missing = find_security_notes_violations()
    if missing:
        print("Missing or incomplete Security Notes evidence in:")
        for path in missing:
            print(f"- {path}")
        return 1

    print("Security Notes check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
