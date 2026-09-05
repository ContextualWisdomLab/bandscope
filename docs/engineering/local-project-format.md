# Local Project Format

This document describes the project data that BandScope currently persists in a `.bscope` file and the security boundary around that file. The versioned crash-safe format, autosave, migration, backup, and recovery authority remains #962.

## Current persisted payload

A `.bscope` file is JSON containing the serialized `RehearsalSong` contract from `@bandscope/shared-types`. The renderer validates the song before Save, and the native save/load boundary independently deserializes the same allowed fields. Neither layer may silently drop a field accepted by the other.

The current top level is:

```json
{
  "id": "string",
  "title": "string",
  "tempo": 120,
  "sections": [ ... ],
  "exportSummary": {
    "format": "cue-sheet",
    "headline": "string",
    "focusSections": ["string"]
  },
  "collaboration": {
    "syncMode": "local_only",
    "syncNote": "string",
    "assignments": [ ... ],
    "comments": [ ... ],
    "approvals": [ ... ]
  },
  "scoreAttachments": [
    { "id": "uuid", "fileName": "score.pdf" }
  ]
}
```

`tempo`, `collaboration`, and `scoreAttachments` are optional. Absence remains valid for older files supported by the current contract.

## Sections, roles, and provenance

Each section carries an exact integer `timeRange` with `end > start`, confidence/provenance, roles, and the part handoff graph. A role may additionally carry the current optional rehearsal fields `harmonicExplanation`, `transpositionPlan`, `transcription`, and `practiceProgress`.

```json
{
  "id": "verse-1",
  "label": "verse",
  "groove": "string",
  "timeRange": { "start": 10, "end": 30 },
  "confidence": {
    "level": "medium",
    "source": "model",
    "notes": "string"
  },
  "roles": [ ... ],
  "partGraph": [ ... ]
}
```

BandScope records user-corrected harmony in the role's `manualOverrides` array instead of overwriting provenance invisibly:

```json
{
  "id": "bass-guitar",
  "name": "Bass Guitar",
  "harmony": {
    "chord": "C#m7",
    "functionLabel": "vi pedal anchor",
    "source": "user"
  },
  "manualOverrides": [
    {
      "field": "harmony",
      "value": {
        "chord": "C#m7",
        "functionLabel": "vi pedal anchor",
        "source": "user"
      },
      "source": "user"
    }
  ]
}
```

Score attachment bytes are not embedded in this JSON. The project stores only the app-minted score id and display file name; native storage owns the PDF bytes separately.

## Security constraints

`.bscope` is untrusted user input. The current boundary applies these constraints:

- Tauri refuses project files larger than 5 MiB before JSON parsing.
- Shared TypeScript validation and the native Rust DTO use explicit allowed fields; native structs keep `deny_unknown_fields` instead of accepting arbitrary JSON.
- A malformed or incomplete payload fails closed rather than executing code or best-effort dropping fields.
- Project JSON does not gain arbitrary filesystem access. Playback-source authorities and renderer-local source-switch receipts are volatile runtime state and are not persisted by this format.

The structural allowlist is not yet the complete commercial durability policy. #962 still owns explicit collection/string/nesting limits, duplicate/cycle rules, portable source references, platform-semantic equivalence, and filesystem fault handling.

## Compatibility and crash-safety status

Current additive optional fields remain readable when absent, and legacy sections missing `timeRange` receive only the existing narrowly defined renderer migration path. There is not yet an independent `project_format_version` with ordered migration receipts.

The native Save path is also not yet crash-safe publication: atomic staging, required flushes, validation before replace, known-good backup, autosave, recovery snapshots, interrupted migration behavior, and fault injection remain open acceptance criteria in #962. A successful ordinary Save/Load round trip must therefore not be described as crash/power-loss durability evidence.

`docs/traceability/project-persistence-contract-parity.md` records the 2026-09-05 repair that brought the native payload back into structural parity with fields already accepted by `RehearsalSong`.
