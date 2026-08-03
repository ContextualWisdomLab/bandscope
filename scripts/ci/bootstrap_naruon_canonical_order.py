#!/usr/bin/env python3
"""Canonicalize nested naruon handoff key order, then self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/shared-types/src/naruon.ts"
SELF = ROOT / "scripts/ci/bootstrap_naruon_canonical_order.py"
WORKFLOW = ROOT / ".github/workflows/bootstrap-naruon-canonical-order.yml"

OLD = '''    source: { ...source },
    normGroup: { ...normGroup },
    event:
      event.venue === undefined
        ? {
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timeZone: event.timeZone
          }
        : { ...event },
    commitment: { ...commitment },
    provenance: {
      sourceRecordId: provenance.sourceRecordId,
      confidence: provenance.confidence,
      evidence: provenance.evidence.map((receipt) => ({ ...receipt }))
    }
'''

NEW = '''    source: {
      application: source.application,
      workspaceId: source.workspaceId,
      bandId: source.bandId,
      rehearsalId: source.rehearsalId
    },
    normGroup: {
      kind: normGroup.kind,
      id: normGroup.id,
      label: normGroup.label
    },
    event:
      event.venue === undefined
        ? {
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timeZone: event.timeZone
          }
        : {
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            timeZone: event.timeZone,
            venue: event.venue
          },
    commitment: {
      status: commitment.status,
      rsvpDirection: commitment.rsvpDirection
    },
    provenance: {
      sourceRecordId: provenance.sourceRecordId,
      confidence: provenance.confidence,
      evidence: provenance.evidence.map((receipt) => ({
        field: receipt.field,
        value: receipt.value
      }))
    }
'''


def main() -> int:
    """Apply the reviewed deterministic-order fix and remove bootstrap artifacts."""
    text = SOURCE.read_text(encoding="utf-8")
    count = text.count(OLD)
    if count == 1:
        SOURCE.write_text(text.replace(OLD, NEW, 1), encoding="utf-8")
    elif NEW not in text:
        raise RuntimeError(f"canonicalization fragment drifted: expected one match, found {count}")
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
