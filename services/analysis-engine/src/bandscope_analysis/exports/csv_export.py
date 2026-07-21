"""CSV cue-sheet export builder for the analysis engine.

Turns the ``RehearsalSong`` dict built by :mod:`bandscope_analysis.api` into
a valid CSV string representation using standard Python libraries.

Security Notes:
    - Pure dict-to-string transformation: no file, network, or process I/O.
    - Never reads source-path fields and never emits filesystem paths.
    - Mitigates CSV formula injection risks by escaping leading problematic characters.
    - Safe failure: ``None``, empty, or malformed input yields a CSV with only headers.
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Mapping

from bandscope_analysis.exports.chart import build_cue_sheet_rows

__all__ = ["build_csv_text"]

_FORMULA_INJECTION_PATTERN = re.compile(r"^[\s\uFEFF\xA0]*[=+\-@\t\r\n]")


def _escape_csv_field(value: str) -> str:
    """Escape a field to prevent CSV formula injection."""
    if _FORMULA_INJECTION_PATTERN.match(value):
        return f"'{value}"
    return value


def build_csv_text(song: Mapping[str, object] | None) -> str:
    """Build a CSV string representation of a song's cue sheet.

    Extracts rows using ``build_cue_sheet_rows`` and writes them to an in-memory
    string buffer using the standard library's ``csv.writer``. Ensures robust handling
    of missing data and potential injection characters.
    """
    output = io.StringIO()
    writer = csv.writer(output, dialect="excel")

    # Write headers
    writer.writerow(
        [
            "Section",
            "Start",
            "End",
            "Cue",
            "Roles",
        ]
    )

    rows = build_cue_sheet_rows(song)
    for row in rows:
        writer.writerow(
            [
                _escape_csv_field(row.get("section", "")),
                _escape_csv_field(row.get("start", "")),
                _escape_csv_field(row.get("end", "")),
                _escape_csv_field(row.get("cue", "")),
                _escape_csv_field(", ".join(row.get("roles", []))),
            ]
        )

    return output.getvalue()
