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
MARKDOWN_CLOSING_HASHES = re.compile(r"[ \t]+#+[ \t]*$")
HTML_LITERAL_OPEN = re.compile(r"^ {0,3}<(?:pre|script|style|textarea)(?:[ \t>]|$)", re.I)
HTML_LITERAL_CLOSE = re.compile(r"</(?:pre|script|style|textarea)>", re.I)
HTML_COMMENT_OPEN = re.compile(r"^ {0,3}<!--")
HTML_COMMENT_CLOSE = re.compile(r"-->")
HTML_PROCESSING_OPEN = re.compile(r"^ {0,3}<\?")
HTML_PROCESSING_CLOSE = re.compile(r"\?>")
HTML_DECLARATION_OPEN = re.compile(r"^ {0,3}<![A-Za-z]")
HTML_DECLARATION_CLOSE = re.compile(r">")
HTML_CDATA_OPEN = re.compile(r"^ {0,3}<!\[CDATA\[")
HTML_CDATA_CLOSE = re.compile(r"\]\]>")
HTML_BLOCK_TAG_NAMES = (
    "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|"
    "details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|"
    "h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|"
    "noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|"
    "thead|title|tr|track|ul"
)
HTML_BLOCK_TAG_OPEN = re.compile(
    rf"^ {{0,3}}</?(?:{HTML_BLOCK_TAG_NAMES})(?:[ \t]|/?>|$)", re.I
)
HTML_ATTRIBUTE = (
    r"[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*"
    r"(?:[^\"'=<>` \t]+|'[^']*'|\"[^\"]*\"))?"
)
HTML_OPEN_TAG = re.compile(
    rf"^ {{0,3}}<[A-Za-z][A-Za-z0-9-]*(?:[ \t]+{HTML_ATTRIBUTE})*[ \t]*/?>[ \t]*$"
)
HTML_CLOSE_TAG = re.compile(r"^ {0,3}</[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$")


def _html_block_start(line: str) -> tuple[str, re.Pattern[str] | None] | None:
    """Return a conservative CommonMark raw-HTML block termination mode for this line."""
    if HTML_LITERAL_OPEN.match(line):
        return "pattern", HTML_LITERAL_CLOSE
    if HTML_COMMENT_OPEN.match(line):
        return "pattern", HTML_COMMENT_CLOSE
    if HTML_PROCESSING_OPEN.match(line):
        return "pattern", HTML_PROCESSING_CLOSE
    if HTML_DECLARATION_OPEN.match(line):
        return "pattern", HTML_DECLARATION_CLOSE
    if HTML_CDATA_OPEN.match(line):
        return "pattern", HTML_CDATA_CLOSE
    if HTML_BLOCK_TAG_OPEN.match(line):
        return "blank", None
    if HTML_OPEN_TAG.match(line) or HTML_CLOSE_TAG.match(line):
        return "blank", None
    return None


def _markdown_headings(content: str) -> list[tuple[int, int, str]]:
    """Return ATX headings outside fenced/indented code and raw HTML blocks."""
    headings: list[tuple[int, int, str]] = []
    fence_character: str | None = None
    fence_length = 0
    html_mode: str | None = None
    html_end_pattern: re.Pattern[str] | None = None

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

        if html_mode == "pattern":
            if html_end_pattern is not None and html_end_pattern.search(line):
                html_mode = None
                html_end_pattern = None
            continue
        if html_mode == "blank":
            if not line.strip():
                html_mode = None
            continue

        if fence_match is not None:
            marker = fence_match.group(1)
            fence_character = marker[0]
            fence_length = len(marker)
            continue

        html_start = _html_block_start(line)
        if html_start is not None:
            html_mode, html_end_pattern = html_start
            if (
                html_mode == "pattern"
                and html_end_pattern is not None
                and html_end_pattern.search(line)
            ):
                html_mode = None
                html_end_pattern = None
            continue

        heading_match = MARKDOWN_HEADING.match(line)
        if heading_match is None:
            continue
        heading_text = heading_match.group(2).strip(" \t")
        if heading_text and set(heading_text) == {"#"}:
            heading_text = ""
        else:
            heading_text = MARKDOWN_CLOSING_HASHES.sub("", heading_text).strip(" \t")
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
