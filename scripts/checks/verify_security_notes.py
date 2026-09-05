"""Verify that security-sensitive design and traceability documents include Security Notes."""

from pathlib import Path
import re

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
MARKDOWN_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def security_notes_section(content: str) -> str:
    """Extract only the lowercased Security Notes section from a governed document."""
    lines = content.splitlines()
    start_index: int | None = None
    heading_level: int | None = None

    for index, line in enumerate(lines):
        match = MARKDOWN_HEADING.match(line.strip())
        if match is None:
            continue
        heading_text = match.group(2).rstrip("#").strip()
        if heading_text.casefold() == SECURITY_NOTES_TEXT.casefold():
            start_index = index
            heading_level = len(match.group(1))
            break

    if start_index is None or heading_level is None:
        return ""

    end_index = len(lines)
    for index in range(start_index + 1, len(lines)):
        match = MARKDOWN_HEADING.match(lines[index].strip())
        if match is not None and len(match.group(1)) <= heading_level:
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
