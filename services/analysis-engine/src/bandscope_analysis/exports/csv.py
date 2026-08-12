"""CSV export builder for the analysis engine.

Turns the ``RehearsalSong`` dict built by :mod:`bandscope_analysis.api` into
a CSV string format of the cue-sheet rows suitable for export.

Security Notes:
    - Pure dict-to-string transformation: no file, network, or process I/O.
    - Prevents CSV formula injection by explicitly escaping fields starting
      with `=`, `+`, `-`, or `@`.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Mapping

from bandscope_analysis.exports.chart import build_cue_sheet_rows

__all__ = ["build_cue_sheet_csv", "escape_csv_field"]


def escape_csv_field(value: str) -> str:
    """Escape CSV field to prevent formula injection.

    If the field starts with a problematic character (``=``, ``+``, ``-``, ``@``)
    or starts with a whitespace character followed by one of these characters,
    it is prefixed with a single quote (``'``) to force the spreadsheet
    application to evaluate it as text rather than a formula or command.
    """
    if not value:
        return value
    stripped = value.lstrip()
    if stripped and stripped[0] in ("=", "+", "-", "@"):
        # If there are leading whitespaces, prefix before them or prefix the whole value
        # Actually, formula injection often works even with leading spaces or tabs.
        # To be safe, we prefix the entire original string with a single quote
        # if the first non-whitespace char is a trigger.
        return f"'{value}"
    return value


def build_cue_sheet_csv(song: Mapping[str, object] | None) -> str:
    """Build a CSV string of cue-sheet rows from a song payload.

    Rows are first built via :func:`build_cue_sheet_rows`, then formatted
    as CSV with headers: ``Section,Start,End,Cue,Roles``. Fields are
    automatically escaped to mitigate CSV formula injection.
    """
    rows = build_cue_sheet_rows(song)
    if not rows:
        return ""

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")

    # Write headers
    writer.writerow(["Section", "Start", "End", "Cue", "Roles"])

    # Write rows
    for row in rows:
        roles_str = ", ".join(row.get("roles", []))
        writer.writerow(
            [
                escape_csv_field(row.get("section", "")),
                escape_csv_field(row.get("start", "")),
                escape_csv_field(row.get("end", "")),
                escape_csv_field(row.get("cue", "")),
                escape_csv_field(roles_str),
            ]
        )

    return buffer.getvalue()
