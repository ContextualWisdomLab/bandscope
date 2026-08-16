"""CSV export builder for the analysis engine.

Turns the ``RehearsalSong`` dict built by :mod:`bandscope_analysis.api` into
a CSV string format of the cue-sheet rows suitable for export.

Security Notes:
    - Pure dict-to-string transformation: no file, network, or process I/O.
    - Neutralizes spreadsheet formula prefixes described by CWE-1236 and
      current OWASP CSV-injection guidance, including control and full-width
      variants that may be interpreted specially by spreadsheet software.
    - Treats a leading NUL as unsafe defense in depth for downstream parsers.
    - Uses :mod:`csv` for field-boundary quoting so attacker-controlled commas,
      quotes, and line breaks cannot create an unquoted sibling cell.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Mapping

from bandscope_analysis.exports.chart import build_cue_sheet_rows

__all__ = ["build_cue_sheet_csv", "escape_csv_field"]

_FORMULA_PREFIXES = frozenset("=+-@＝＋－＠")
_CONTROL_PREFIXES = frozenset("\t\r\n\x00")


def escape_csv_field(value: str) -> str:
    """Neutralize spreadsheet-sensitive prefixes in an untrusted CSV field.

    Formula-sensitive ASCII prefixes (``=``, ``+``, ``-``, ``@``), their
    full-width variants, and leading tab/CR/LF/NUL controls are prefixed with a
    single apostrophe. Dangerous formula or control prefixes are also detected
    after leading whitespace because downstream parser normalization is not
    uniform across spreadsheet products.

    The apostrophe follows the mitigation documented for CWE-1236. Spreadsheet
    products do not share one universally reliable CSV formula-neutralization
    contract, so callers must continue treating exports as untrusted documents.
    """
    if not value:
        return value

    if value[0] in _CONTROL_PREFIXES:
        return f"'{value}"

    stripped = value.lstrip()
    leading = value[: len(value) - len(stripped)]
    if any(character in _CONTROL_PREFIXES for character in leading):
        return f"'{value}"
    if stripped and (
        stripped[0] in _FORMULA_PREFIXES or stripped[0] in _CONTROL_PREFIXES
    ):
        return f"'{value}"
    return value


def build_cue_sheet_csv(song: Mapping[str, object] | None) -> str:
    """Build a CSV string of cue-sheet rows from a song payload.

    Rows are first built via :func:`build_cue_sheet_rows`, then formatted
    with headers ``Section,Start,End,Cue,Roles``. Every untrusted textual field
    is neutralized before :mod:`csv` performs delimiter and quote escaping.
    """
    rows = build_cue_sheet_rows(song)
    if not rows:
        return ""

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["Section", "Start", "End", "Cue", "Roles"])

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
