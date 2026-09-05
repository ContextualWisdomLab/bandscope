# Local Project Format

This document specifies the format and lifecycle of a BandScope `.bscope` project file, focusing on data persistence, manual overrides, and recovery.

## Overview

BandScope projects are saved as `.bscope` files. Current writes use a standard JSON envelope with `projectFormatVersion: 1`; the nested `song` is the current compatibility view used by the desktop contract. Older raw `RehearsalSong` JSON remains loadable as an explicit legacy input and is never silently rewritten in memory as a newer version.

## Schema

The primary data structure for a `.bscope` file is the `RehearsalSong` type from `@bandscope/shared-types`.

### Top-Level Structure (version 1)

```json
{
  "projectFormatVersion": 1,
  "song": {
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
    }
  }
}
```

`tempo` and `collaboration` are optional. The native persistence boundary preserves the current shared collaboration contract and its assignment/comment/approval state domains. Role records also preserve optional `harmonicExplanation`, `transpositionPlan`, `transcription`, and integer `practiceProgress` from 0 through 100. These fields are typed project data; unknown fields still fail closed rather than being retained in an untyped JSON bag.

The version is independent of the application package version. The v1 reader rejects unknown envelope fields and returns an explicit unsupported-version error for a well-formed future version. The checked-in golden fixture is `apps/desktop/core/testdata/project-v1.json`.

### Sections and Roles

Sections describe structural segments of the song (e.g., Intro, Verse, Chorus). Each section contains a list of roles (instruments or vocals).

```json
{
  "id": "section-id",
  "label": "verse",
  "groove": "string",
  "confidence": {
    "level": "high|medium|low",
    "source": "model|user",
    "notes": "string"
  },
  "roles": [ ... ]
}
```

### Manual Overrides

To ensure provenance preservation, BandScope records when a user manually changes an analyzed property. This is stored in the `manualOverrides` array on the `RehearsalRole` object.

```json
{
  "id": "role-id",
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
  ],
  ...
}
```

By retaining `manualOverrides`, BandScope can distinguish between original model outputs and user corrections, meeting the provenance requirements for the product.

## Security Constraints

When loading `.bscope` files from disk, BandScope applies the following constraints:
1. **Size Limits**: The project file must not exceed an upper bound (currently 5 MiB, implemented as `5 * 1024 * 1024` bytes in the Tauri backend) to prevent memory exhaustion.
2. **Schema Validation**: The loaded JSON is structurally validated against the `RehearsalSong` contract. Collaboration state tokens and `practiceProgress` use the same accepted domains as the shared renderer contract.
3. **Bounded Processing**: The JSON parsing is standard and safe, avoiding arbitrary code execution or payload expansion attacks.

## Current boundary and next migration slices

Version 1 deliberately keeps the existing validated `RehearsalSong` as the compatibility view. Source references, derived analysis artifacts, user decisions, portable handoff data, UI preferences, and volatile player state are not fabricated or written into untyped bags. Their typed promotion, bounded autosave journal, backup rotation, migration receipts, and accessible restore/compare/discard flow remain the next #962 slices. Player state must use this authority after the transport state machine is stable; it must not create a second localStorage or session persistence authority.

A selected playback source must be persisted as a stable project semantic such as `full_mix`, `vocals`, `bass`, `drums`, or `other`, never as a revocable `bandscope-playback` authority. Reload must resolve that semantic against current native availability and fail closed to Full mix if the prior source is unavailable.

## Extensibility

Future updates to the `.bscope` format must add an ordered migration from the prior envelope, validate a copy before publication, retain the prior known-good artifact, and update the machine-verifiable fixture. Unknown fields must either be explicitly preserved by a typed schema or rejected; they must never be silently discarded.
