"""Parse the bounded GFM block structure used by repository policy checks."""

from typing import NamedTuple

from markdown_it import MarkdownIt
from markdown_it.token import Token

MARKDOWN = MarkdownIt("commonmark", {"html": True}).enable("table")


class MarkdownHeading(NamedTuple):
    """Describe one rendered top-level Markdown heading span."""

    level: int
    text: str
    start: int
    end: int


class MarkdownTable(NamedTuple):
    """Describe one rendered top-level pipe table."""

    headers: tuple[str, ...]
    rows: tuple[tuple[str, ...], ...]
    source_headers: tuple[str, ...]
    source_rows: tuple[tuple[str, ...], ...]
    start: int
    end: int
    canonical_outer_pipe: bool
    contains_html: bool


class MarkdownDocument(NamedTuple):
    """Hold normalized source lines and rendered top-level blocks."""

    lines: list[str]
    headings: list[MarkdownHeading]
    tables: list[MarkdownTable]
    has_unsafe_html: bool


def _is_closed_html_comment(content: str) -> bool:
    """Return whether HTML source contains only closed comments and whitespace."""
    cursor = 0
    found_comment = False
    while cursor < len(content):
        while cursor < len(content) and content[cursor] in " \t\r\n":
            cursor += 1
        if cursor == len(content):
            break
        if not content.startswith("<!--", cursor):
            return False
        closing = content.find("-->", cursor + 4)
        if closing < 0:
            return False
        body = content[cursor + 4 : closing]
        if "<" in body or ">" in body:
            return False
        found_comment = True
        cursor = closing + 3
    return found_comment


def _token_has_unsafe_html(token: Token) -> bool:
    """Return whether a token contains non-comment raw HTML."""
    if token.type == "html_block":
        return not _is_closed_html_comment(token.content)
    if token.type != "inline":
        return False
    return any(
        child.type == "html_inline" and not _is_closed_html_comment(child.content)
        for child in token.children or []
    )


def _visible_inline_text(token: Token) -> str:
    """Return rendered semantic text without link targets or HTML attributes."""
    visible: list[str] = []
    for child in token.children or []:
        if child.type in {"text", "code_inline", "image"}:
            visible.append(child.content)
        elif child.type in {"softbreak", "hardbreak"}:
            visible.append(" ")
    return "".join(visible)


def _heading_from_tokens(tokens: list[Token], index: int) -> MarkdownHeading | None:
    """Return one top-level rendered heading from a heading-open token."""
    token = tokens[index]
    if token.type != "heading_open" or token.level != 0 or token.map is None:
        return None
    inline = tokens[index + 1] if index + 1 < len(tokens) else None
    if inline is None or inline.type != "inline":
        return None
    return MarkdownHeading(
        level=int(token.tag.removeprefix("h")),
        text=inline.content.strip(" \t"),
        start=token.map[0],
        end=token.map[1],
    )


def _table_rows(
    tokens: list[Token],
    start: int,
) -> tuple[list[tuple[str, ...]], list[tuple[str, ...]], int, bool]:
    """Return rendered rows and the closing-token index for one table."""
    rows: list[tuple[str, ...]] = []
    source_rows: list[tuple[str, ...]] = []
    row: list[str] | None = None
    source_row: list[str] | None = None
    cell: list[str] | None = None
    source_cell: list[str] | None = None
    contains_html = False
    index = start + 1
    while index < len(tokens):
        token = tokens[index]
        if token.type == "table_close":
            return rows, source_rows, index, contains_html
        if token.type == "tr_open":
            row = []
            source_row = []
        elif token.type in {"th_open", "td_open"}:
            cell = []
            source_cell = []
        elif token.type == "inline" and cell is not None:
            cell.append(_visible_inline_text(token))
            source_cell = source_cell or []
            source_cell.append(token.content)
            contains_html = contains_html or any(
                child.type == "html_inline" for child in token.children or []
            )
        elif (
            token.type in {"th_close", "td_close"}
            and row is not None
            and source_row is not None
        ):
            row.append("".join(cell or []).strip(" \t"))
            source_row.append("".join(source_cell or []).strip(" \t"))
            cell = None
            source_cell = None
        elif token.type == "tr_close" and row is not None and source_row is not None:
            rows.append(tuple(row))
            source_rows.append(tuple(source_row))
            row = None
            source_row = None
        index += 1
    return rows, source_rows, len(tokens), contains_html


def _table_from_tokens(
    tokens: list[Token],
    index: int,
    lines: list[str],
) -> MarkdownTable | None:
    """Return one top-level rendered table from a table-open token."""
    token = tokens[index]
    if token.type != "table_open" or token.level != 0 or token.map is None:
        return None
    rows, source_rows, _, contains_html = _table_rows(tokens, index)
    if not rows:
        return None
    start, end = token.map
    source_lines = [line.strip(" \t") for line in lines[start:end] if line.strip(" \t")]
    canonical_outer_pipe = bool(source_lines) and all(
        line.startswith("|") and line.endswith("|") for line in source_lines
    )
    return MarkdownTable(
        headers=rows[0],
        rows=tuple(rows[1:]),
        source_headers=source_rows[0],
        source_rows=tuple(source_rows[1:]),
        start=start,
        end=end,
        canonical_outer_pipe=canonical_outer_pipe,
        contains_html=contains_html,
    )


def _opaque_boundary_from_token(token: Token) -> MarkdownHeading | None:
    """Return a fail-closed top-level boundary for rendered raw HTML."""
    if token.map is None or not _token_has_unsafe_html(token):
        return None
    is_html_block = token.type == "html_block" and token.level == 0
    is_top_level_inline_html = (
        token.type == "inline"
        and token.level == 1
        and any(child.type == "html_inline" for child in token.children or [])
    )
    if not (is_html_block or is_top_level_inline_html):
        return None
    return MarkdownHeading(1, "", token.map[0], token.map[1])


def scan_markdown(content: str) -> MarkdownDocument:
    """Return rendered top-level headings and tables from normalized Markdown."""
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    tokens = MARKDOWN.parse(normalized)
    headings: list[MarkdownHeading] = []
    tables: list[MarkdownTable] = []
    has_unsafe_html = False
    for index in range(len(tokens)):
        has_unsafe_html = has_unsafe_html or _token_has_unsafe_html(tokens[index])
        opaque_boundary = _opaque_boundary_from_token(tokens[index])
        if opaque_boundary is not None:
            headings.append(opaque_boundary)
        heading = _heading_from_tokens(tokens, index)
        if heading is not None:
            headings.append(heading)
        table = _table_from_tokens(tokens, index, lines)
        if table is not None:
            tables.append(table)
    headings.sort(key=lambda heading: (heading.start, heading.end, heading.level))
    return MarkdownDocument(lines, headings, tables, has_unsafe_html)


def section_end(
    document: MarkdownDocument,
    heading: MarkdownHeading,
    *,
    maximum_peer_level: int = 2,
) -> int:
    """Return the first line of the next rendered top-level peer heading."""
    end = len(document.lines)
    for candidate in document.headings:
        if candidate.start >= heading.end and candidate.level <= maximum_peer_level:
            end = candidate.start
            break
    return end


def section_text(
    document: MarkdownDocument,
    heading: MarkdownHeading,
    *,
    maximum_peer_level: int = 2,
) -> str:
    """Return raw section source until the next rendered top-level peer heading."""
    end = section_end(document, heading, maximum_peer_level=maximum_peer_level)
    return "\n".join(document.lines[heading.end : end])


def section_tables(
    document: MarkdownDocument,
    heading: MarkdownHeading,
    *,
    maximum_peer_level: int = 2,
) -> list[MarkdownTable]:
    """Return rendered top-level tables inside a canonical section."""
    end = section_end(document, heading, maximum_peer_level=maximum_peer_level)
    return [table for table in document.tables if heading.end <= table.start < end]
