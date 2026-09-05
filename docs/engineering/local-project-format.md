# Local Project Format

This document specifies the format and lifecycle of a BandScope `.bscope` project file, focusing on data persistence, manual overrides, durable rehearsal preferences, and recovery.

## Overview

BandScope projects are saved as `.bscope` files. Current writes use a strict JSON envelope with `projectFormatVersion: 2`. The nested `song` remains the compatibility view used by the desktop rehearsal contract, while `preferences` is the first typed project-level section outside that song view.

Version 1 files and older raw `RehearsalSong` JSON remain supported inputs. They are parsed by the historical strict song/v1 boundary and migrated in memory to the current document with `preferences.selectedPlaybackSource = "full_mix"`. A migration does not infer that a stem was selected previously because v1 carried no such durable evidence.

## Schema

The rehearsal content inside `song` is the `RehearsalSong` contract from `@bandscope/shared-types`.

### Top-Level Structure (version 2)

```json
{
  "projectFormatVersion": 2,
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
  },
  "preferences": {
    "selectedPlaybackSource": "full_mix"
  }
}
```

`selectedPlaybackSource` is a closed durable semantic with exactly these values: `full_mix`, `vocals`, `bass`, `drums`, or `other`. It is not a media URL, local path, generation receipt, or native playback authority. An opaque `bandscope-playback` authority is runtime-only and must never appear in a `.bscope` file.

The native `save_project`/`load_project` commands now admit and return the complete typed current document, and the TypeScript Project Persistence adapter exposes `saveProjectDocument`/`loadProjectDocument` with the same closed preference domain. Existing song-only `saveProject`/`loadProject` callers remain compatibility adapters and use the deterministic `full_mix` default when they do not own an explicit source preference. The mounted #1160 Active Player still has to supply its selected semantic to this bridge on save and consume the reopened semantic through fresh native source availability; that UI composition step is not claimed complete by the bridge itself.

`tempo` and `collaboration` are optional song fields. The native persistence boundary preserves the current shared collaboration contract and its assignment/comment/approval state domains. Role records also preserve optional `harmonicExplanation`, `transpositionPlan`, `transcription`, and integer `practiceProgress` from 0 through 100. These fields are typed project data; unknown fields still fail closed rather than being retained in an untyped JSON bag.

The project format version is independent of the application package version. Version 2 rejects unknown envelope fields and invalid preference tokens. A well-formed unsupported future version returns an explicit unsupported-version error before its body is interpreted as current truth.

Checked-in compatibility evidence:

- `apps/desktop/core/testdata/project-v1.json` — supported version-1 input.
- `apps/desktop/core/testdata/project-v2.json` — current version-2 document with an explicit `vocals` preference.
- `apps/desktop/core/tests/project_format_v2_playback_preference.rs` — v1 and legacy migration, closed preference-domain, and no-runtime-authority contracts.
- `apps/desktop/core/tests/project_format_v2_fixture.rs` — current golden-fixture round trip.
- `apps/desktop/src/lib/projectDocumentBridge.test.ts` — renderer/native bridge contract for all five stable semantics plus runtime-authority and unknown-preference rejection.

### Version 1 compatibility

Version 1 had the shape below and did not contain project-level preferences:

```json
{
  "projectFormatVersion": 1,
  "song": { ... }
}
```

The ordered v1 → v2 migration keeps the validated song unchanged and creates only one new value: `preferences.selectedPlaybackSource = "full_mix"`. This is idempotent at the current reader/writer boundary: once a document is serialized as v2, reopening and serializing it again preserves the same typed preference instead of re-running a heuristic inference.

### Sections and Roles

Sections describe structural segments of the song (for example Intro, Verse, or Chorus). Each section contains a list of roles.

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

BandScope records user corrections in the `manualOverrides` array on a `RehearsalRole` so an analyzed value is not confused with user-owned rehearsal truth.

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
  ]
}
```

## Security Constraints

When loading `.bscope` files from disk, BandScope applies these constraints:

1. **Size limit** — a project file may not exceed 5 MiB (`5 * 1024 * 1024` bytes) at the current Tauri persistence boundary.
2. **Strict schema validation** — current/v1 envelopes and the rehearsal song contract reject unknown fields according to their published compatibility rule. Playback preference, collaboration state, provenance, cue, role, export, and progress domains are closed values rather than arbitrary strings.
3. **Bounded processing** — project JSON is parsed as data only. The format contains no executable code or runtime playback URL.
4. **Runtime-authority separation** — a selected source is stored only as a stable semantic. Reopening must request a fresh native authority from current resource availability rather than trusting persisted media capability data.

## Current boundary and next migration slices

Version 2 now establishes the first typed project preference, executable legacy/v1 → v2 migration, and a symmetric native/TypeScript current-document Save/Reopen bridge. It does not complete #962. Source references, derived analysis artifacts, user decisions beyond the existing song contract, portable handoff data, broader UI preferences, autosave/recovery state, and volatile player state are not fabricated or written into untyped bags.

The mounted Active Player must still pass its selected semantic into the Project Persistence bridge and, on reopen, resolve the returned semantic against current native source availability. If the requested stem is no longer admitted, the player must fail closed to Full mix. A WebView `localStorage`/session store or serialized `bandscope-playback` URL would create a second authority and is not an acceptable substitute.

The remaining Project Persistence work includes bounded autosave, known-good backup rotation, startup recovery discovery, accessible Restore / Compare / Discard UX, descriptor-bound parent authority, deterministic migration receipts/hashes, downgrade/rollback behavior, and exhaustive interruption/disk-full/power-loss fault injection.

## Extensibility

Each future `.bscope` version must have an ordered deterministic migration from every supported predecessor, validate a copy before publication, retain the prior known-good artifact until the migrated document opens successfully, and add a machine-verifiable golden fixture. Unknown fields must either be explicitly preserved by a typed schema or rejected; they must never be silently discarded.
