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
FENCE_OPEN_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
MARKDOWN_HEADING_RE = re.compile(r"^ {0,3}(#{1,6})(?:[ \t]+|$)(.*?)\s*$")
MARKDOWN_CLOSING_HASHES_RE = re.compile(r"[ \t]+#+[ \t]*$")
HTML_LITERAL_OPEN_RE = re.compile(r"^ {0,3}<(?:pre|script|style|textarea)(?:[ \t>]|$)", re.I)
HTML_LITERAL_CLOSE_RE = re.compile(r"</(?:pre|script|style|textarea)>", re.I)
HTML_PROCESSING_OPEN_RE = re.compile(r"^ {0,3}<\?")
HTML_PROCESSING_CLOSE_RE = re.compile(r"\?>")
HTML_DECLARATION_OPEN_RE = re.compile(r"^ {0,3}<![A-Za-z]")
HTML_DECLARATION_CLOSE_RE = re.compile(r">")
HTML_CDATA_OPEN_RE = re.compile(r"^ {0,3}<!\[CDATA\[")
HTML_CDATA_CLOSE_RE = re.compile(r"\]\]>")
HTML_BLOCK_TAG_NAMES = (
    "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|"
    "details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|"
    "h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|"
    "noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|"
    "thead|title|tr|track|ul"
)
HTML_BLOCK_TAG_OPEN_RE = re.compile(
    rf"^ {{0,3}}</?(?:{HTML_BLOCK_TAG_NAMES})(?:[ \t]|/?>|$)", re.I
)
HTML_ATTRIBUTE = (
    r"[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*"
    r"(?:[^\"'=<>` \t]+|'[^']*'|\"[^\"]*\"))?"
)
HTML_OPEN_TAG_RE = re.compile(
    rf"^ {{0,3}}<[A-Za-z][A-Za-z0-9-]*(?:[ \t]+{HTML_ATTRIBUTE})*[ \t]*/?>[ \t]*$"
)
HTML_CLOSE_TAG_RE = re.compile(r"^ {0,3}</[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$")

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


def _html_block_start(line: str) -> tuple[str, re.Pattern[str] | None] | None:
    """Return the conservative raw-HTML block termination mode for one line."""
    if HTML_LITERAL_OPEN_RE.match(line):
        return "pattern", HTML_LITERAL_CLOSE_RE
    if HTML_PROCESSING_OPEN_RE.match(line):
        return "pattern", HTML_PROCESSING_CLOSE_RE
    if HTML_DECLARATION_OPEN_RE.match(line):
        return "pattern", HTML_DECLARATION_CLOSE_RE
    if HTML_CDATA_OPEN_RE.match(line):
        return "pattern", HTML_CDATA_CLOSE_RE
    if HTML_BLOCK_TAG_OPEN_RE.match(line):
        return "blank", None
    if HTML_OPEN_TAG_RE.match(line) or HTML_CLOSE_TAG_RE.match(line):
        return "blank", None
    return None


def markdown_policy_lines(content: str) -> list[str]:
    """Return source lines admissible as rendered Markdown policy evidence."""
    visible: list[str] = []
    fence_character = ""
    fence_length = 0
    html_mode = ""
    html_end_pattern: re.Pattern[str] | None = None
    in_html_comment = False

    for raw_line in content.splitlines():
        fence_match = FENCE_OPEN_RE.match(raw_line)
        if fence_character:
            if fence_match is not None:
                marker = fence_match.group(1)
                trailer = fence_match.group(2)
                if (
                    marker[0] == fence_character
                    and len(marker) >= fence_length
                    and not trailer.strip()
                ):
                    fence_character = ""
                    fence_length = 0
            visible.append("")
            continue

        if html_mode == "pattern":
            if html_end_pattern is not None and html_end_pattern.search(raw_line):
                html_mode = ""
                html_end_pattern = None
            visible.append("")
            continue
        if html_mode == "blank":
            if not raw_line.strip():
                html_mode = ""
            visible.append("")
            continue

        line, in_html_comment = _remove_html_comment_content(raw_line, in_html_comment)
        if in_html_comment and not line:
            visible.append("")
            continue

        fence_match = FENCE_OPEN_RE.match(line)
        if fence_match is not None:
            marker = fence_match.group(1)
            fence_character = marker[0]
            fence_length = len(marker)
            visible.append("")
            continue

        if line.startswith("\t") or line.startswith("    "):
            visible.append("")
            continue

        html_start = _html_block_start(line)
        if html_start is not None:
            html_mode, html_end_pattern = html_start
            if (
                html_mode == "pattern"
                and html_end_pattern is not None
                and html_end_pattern.search(line)
            ):
                html_mode = ""
                html_end_pattern = None
            visible.append("")
            continue

        visible.append(line)

    return visible


def _markdown_headings(content: str) -> list[tuple[int, int, str]]:
    """Return ATX headings admitted as rendered Markdown policy evidence."""
    headings: list[tuple[int, int, str]] = []
    for index, line in enumerate(markdown_policy_lines(content)):
        heading_match = MARKDOWN_HEADING_RE.match(line)
        if heading_match is None:
            continue
        heading_text = heading_match.group(2).strip(" \t")
        if heading_text and set(heading_text) == {"#"}:
            heading_text = ""
        else:
            heading_text = MARKDOWN_CLOSING_HASHES_RE.sub("", heading_text).strip(" \t")
        headings.append((index, len(heading_match.group(1)), heading_text))
    return headings


def security_notes_section(content: str) -> str:
    """Extract rendered policy evidence from the first explicit Security Notes heading."""
    lines = markdown_policy_lines(content)
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
