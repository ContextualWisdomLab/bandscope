"""CSV export builder for the analysis engine.

Turns the ``RehearsalSong`` dict built by :mod:`bandscope_analysis.api` into
a CSV string format of the cue-sheet rows suitable for export.

Security Notes:
    - Pure dict-to-string transformation: no file, network, or process I/O.
    - Prevents CSV formula injection by explicitly escaping fields starting
      with formula operators or spreadsheet-recognized control characters.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Mapping

from bandscope_analysis.exports.chart import build_cue_sheet_rows

__all__ = ["build_cue_sheet_csv", "escape_csv_field"]

_DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n", "\x00")


def escape_csv_field(value: str) -> str:
    """Escape CSV field to prevent formula injection.

    Fields beginning with a formula operator or spreadsheet-recognized control
    character are prefixed with a single quote (``'``) so spreadsheet
    applications treat them as text rather than formulas or commands.
    """
    if value and value[0] in _DANGEROUS_PREFIXES:
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
