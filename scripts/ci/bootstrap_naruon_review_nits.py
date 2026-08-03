"""Apply the reviewed naruon contract cleanup and remove this bootstrap."""

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    """Replace one exact snippet and fail closed when the branch moved."""
    file_path = Path(path)
    content = file_path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"expected one match in {path}, found {count}")
    file_path.write_text(content.replace(old, new, 1), encoding="utf-8")


replace_once(
    "packages/shared-types/src/naruon.ts",
    "  if (!Number.isSafeInteger(length) || length < 0 || length > maximumLength) return false;",
    "  if (!Number.isSafeInteger(length) || length > maximumLength) return false;",
)
replace_once(
    "packages/shared-types/src/naruon.ts",
    '  return typeof value === "string" && values.includes(value as T);',
    "  return values.includes(value as T);",
)
replace_once(
    "packages/shared-types/test/naruon-schema.test.ts",
    'import {\n  NARUON_REHEARSAL_HANDOFF_KIND,',
    'import {\n  MAX_NARUON_EVIDENCE_RECEIPTS,\n  NARUON_REHEARSAL_HANDOFF_KIND,',
)
replace_once(
    "packages/shared-types/test/naruon-schema.test.ts",
    "    expect(schema.properties.provenance.properties.evidence.maxItems).toBe(64);",
    "    expect(schema.properties.provenance.properties.evidence.maxItems).toBe(\n      MAX_NARUON_EVIDENCE_RECEIPTS\n    );",
)
replace_once(
    "docs/integrations/naruon.md",
    "- The JSON Schema companion is `naruon-rehearsal-handoff-v1.schema.json`; the TypeScript parser remains authoritative for payload-size, snapshot, cross-field, RFC 9557 offset/time-zone consistency, and IANA time-zone checks.",
    "- The JSON Schema companion is `naruon-rehearsal-handoff-v1.schema.json`; validators must compile schema patterns with Unicode semantics for `\\p{Nd}`, and the TypeScript parser remains authoritative for payload-size, snapshot, cross-field, leading/trailing whitespace normalization, Unicode-aware numeric-only identifier rejection, RFC 9557 offset/time-zone consistency, and IANA time-zone checks.",
)

Path("scripts/ci/bootstrap_naruon_review_nits.py").unlink()
Path(".github/workflows/bootstrap-naruon-review-nits.yml").unlink()
