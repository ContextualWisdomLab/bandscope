"""Verify that security-sensitive design and traceability documents include Security Notes."""

import re
from pathlib import Path

SECURITY_NOTES_TEXT = "Security Notes"
SECURITY_NOTE_DIRS = (Path("docs/plans"), Path("docs/traceability"))
REQUIRED_SUBSECTIONS = [
    "attack surface",
    "trust boundary",
    "mitigations",
    "test points",
    "realistic threats",
    "remaining risk",
]
MARKDOWN_HEADING = re.compile(r"^ {0,3}(#{1,6})(?:[ \t]+|$)(.*?)\s*$")
MARKDOWN_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


def _markdown_headings(content: str) -> list[tuple[int, int, str]]:
    """Return ATX headings that are outside fenced and indented code blocks."""
    headings: list[tuple[int, int, str]] = []
    fence_character: str | None = None
    fence_length = 0

    for index, line in enumerate(content.splitlines()):
        fence_match = MARKDOWN_FENCE.match(line)
        if fence_character is not None:
            if fence_match is not None:
                marker = fence_match.group(1)
                trailer = fence_match.group(2)
                if (
                    marker[0] == fence_character
                    and len(marker) >= fence_length
                    and not trailer.strip()
                ):
                    fence_character = None
                    fence_length = 0
            continue

        if fence_match is not None:
            marker = fence_match.group(1)
            fence_character = marker[0]
            fence_length = len(marker)
            continue

        heading_match = MARKDOWN_HEADING.match(line)
        if heading_match is None:
            continue
        heading_text = heading_match.group(2).rstrip("#").strip()
        headings.append((index, len(heading_match.group(1)), heading_text))

    return headings


def security_notes_section(content: str) -> str:
    """Extract only the lowercased Security Notes section from a governed document."""
    lines = content.splitlines()
    headings = _markdown_headings(content)
    start_index: int | None = None
    heading_level: int | None = None
    heading_position: int | None = None

    for position, (index, level, heading_text) in enumerate(headings):
        if heading_text.casefold() == SECURITY_NOTES_TEXT.casefold():
            start_index = index
            heading_level = level
            heading_position = position
            break

    if start_index is None or heading_level is None or heading_position is None:
        return ""

    end_index = len(lines)
    for index, level, _heading_text in headings[heading_position + 1 :]:
        if level <= heading_level:
            end_index = index
            break

    return "\n".join(lines[start_index:end_index]).lower()


def governed_documents() -> list[Path]:
    """Return plan and traceability documents governed by the Security Notes contract."""
    return [
        path
        for directory in SECURITY_NOTE_DIRS
        for path in sorted(directory.glob("*.md"))
    ]


def main() -> int:
    """Return a failing exit code when Security Notes or required subsections are missing."""
    missing: list[str] = []
    for path in governed_documents():
        content = path.read_text(encoding="utf-8")
        if SECURITY_NOTES_TEXT not in content:
            missing.append(str(path))
            continue
        lowered = security_notes_section(content)
        for subsection in REQUIRED_SUBSECTIONS:
            if subsection not in lowered:
                missing.append(f"{path} missing subsection: {subsection}")

    if missing:
        print("Missing Security Notes section in:")
        for path in missing:
            print(f"- {path}")
        return 1

    print("Security Notes check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
