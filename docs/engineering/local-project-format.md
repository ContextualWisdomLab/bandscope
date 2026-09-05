# Local Project Format

This document specifies the format and lifecycle of a BandScope `.bscope` project file, focusing on data persistence, manual overrides, durable rehearsal preferences, source re-admission, and recovery.

## Overview

BandScope projects are saved as `.bscope` files. Current writes use a strict JSON envelope with `projectFormatVersion: 3`. The nested `song` remains the compatibility view used by the desktop rehearsal contract, `preferences` stores durable rehearsal UI intent, and the optional `sourceReference` is the first typed handle for locating an app-owned full-mix artifact after process restart.

Version 2, version 1, and older raw `RehearsalSong` JSON remain supported inputs. Version 2 is migrated with its existing `preferences` and no invented source reference. Version 1 and legacy song JSON are migrated with `preferences.selectedPlaybackSource = "full_mix"` and no source reference. A migration does not infer a source artifact that the historical file never recorded.

## Schema

The rehearsal content inside `song` is the `RehearsalSong` contract from `@bandscope/shared-types`.

### Top-Level Structure (version 3)

```json
{
  "projectFormatVersion": 3,
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
  },
  "sourceReference": {
    "projectId": "project-400-4",
    "artifactName": "source.wav",
    "extension": "wav",
    "fileSizeBytes": 4096
  }
}
```

`selectedPlaybackSource` is a closed durable semantic with exactly these values: `full_mix`, `vocals`, `bass`, `drums`, or `other`. It is not a media URL, local path, generation receipt, or native playback authority. An opaque `bandscope-playback` authority is runtime-only and must never appear in a `.bscope` file.

`sourceReference` is optional because historical projects and compatibility callers do not have enough evidence to invent one. When present, it is restricted to an opaque BandScope `projectId`, the fixed app-owned artifact name `source.<extension>`, one of `wav | mp3 | flac | m4a`, and a non-zero byte length. It contains no source path. The current source-reference schema is a prerequisite for process-restart re-admission; it does not by itself prove that Resource Admission has already materialized or reopened the corresponding artifact.

The native `save_project`/`load_project` commands admit and return the complete typed current document, and the TypeScript Project Persistence adapter exposes `saveProjectDocument`/`loadProjectDocument` with the same closed preference/source-reference domains. Existing song-only `saveProject`/`loadProject` callers remain compatibility adapters and do not invent a source reference. The mounted Active Player still has to compose its selected semantic and current source reference into this bridge, then resolve the reopened semantic through freshly re-admitted native source availability.

`tempo` and `collaboration` are optional song fields. The native persistence boundary preserves the current shared collaboration contract and its assignment/comment/approval state domains. Role records also preserve optional `harmonicExplanation`, `transpositionPlan`, `transcription`, and integer `practiceProgress` from 0 through 100. These fields are typed project data; unknown fields still fail closed rather than being retained in an untyped JSON bag.

The project format version is independent of the application package version. Version 3 rejects unknown envelope fields, invalid preference tokens, user-path-shaped source reference fields, mismatched artifact names/extensions, invalid project ids, and zero-length source evidence. A well-formed unsupported future version returns an explicit unsupported-version error before its body is interpreted as current truth.

Checked-in compatibility evidence:

- `apps/desktop/core/testdata/project-v1.json` — supported version-1 input.
- `apps/desktop/core/testdata/project-v2.json` — supported version-2 document with an explicit `vocals` preference.
- `apps/desktop/core/tests/project_format_v2_playback_preference.rs` — legacy/v1 migration and closed preference-domain contracts.
- `apps/desktop/core/tests/project_format_v2_fixture.rs` — version-2 fixture migration and current serialization.
- `apps/desktop/core/tests/project_format_v3_source_reference.rs` — current source-reference round trip, v2 migration, and fail-closed path/shape tests.
- `apps/desktop/src/lib/projectDocumentBridge.test.ts` — renderer/native bridge contract for stable source semantics and source-reference admission.
- `apps/desktop/src/lib/projectDocument.plainRecord.test.ts` — passive JSON-record admission, including accessor/proxy rejection without executing getters.

### Historical migration

Version 1 had the shape below and did not contain project-level preferences:

```json
{
  "projectFormatVersion": 1,
  "song": { ... }
}
```

Version 2 added only the typed preferences section. The ordered v1 → v2 migration created `preferences.selectedPlaybackSource = "full_mix"`; legacy raw-song input followed the same rule. Version 3 retains that preference and adds no source reference unless one is explicitly supplied by the current Resource Admission/Project Persistence contract. Serializing any supported predecessor writes the current version-3 envelope, so reopening the result does not rerun heuristic inference.

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
2. **Strict schema validation** — current and historical envelopes plus the rehearsal song contract reject unknown fields according to their published compatibility rule. Playback preference, source reference, collaboration state, provenance, cue, role, export, and progress domains are typed rather than arbitrary strings.
3. **Bounded processing** — project JSON is parsed as data only. The format contains no executable code or runtime playback URL.
4. **Runtime-authority separation** — a selected playback source is stored only as a stable semantic. Reopening must request a fresh native authority from current resource availability rather than trusting persisted media capability data.
5. **Filesystem-authority separation** — `sourceReference` cannot carry an absolute/relative user path. Native code must derive any app-owned artifact path from the validated project id and fixed artifact basename, validate the artifact without following untrusted path input, and compare the recorded byte length before reuse.
6. **Purpose-bound metadata** — the source reference does not persist the user's original filesystem location. Its fields exist only to locate and verify BandScope-owned audio needed for rehearsal reopen.

## Current boundary and next migration slices

Version 3 establishes the durable source-reference schema and renderer/native admission contract. It does **not** complete source re-admission. Current local intake still keeps the selected source/bootstrap authority in process memory and must be changed so Resource Admission materializes the full mix under the app-owned project namespace before a valid `sourceReference` can be written. Reopen must then derive that artifact from the validated reference, verify its non-zero recorded byte length and admission rules, reconstruct a fresh bootstrap, and only afterward let Active Player resolve `selectedPlaybackSource` against current stem availability.

The source artifact itself must not be represented by an arbitrary filesystem path in the project file. A WebView `localStorage`/session store, a serialized `bandscope-playback` URL, or a copied external absolute path would create a second authority and is not an acceptable substitute. If the durable full-mix artifact is absent or fails re-admission, the UI must report that state rather than silently presenting a stale stem selection.

The remaining Project Persistence work also includes bounded autosave, known-good backup rotation, startup recovery discovery, accessible Restore / Compare / Discard UX, descriptor-bound parent authority, deterministic migration receipts/hashes, downgrade/rollback behavior, and exhaustive interruption/disk-full/power-loss fault injection.

## Extensibility

Each future `.bscope` version must have an ordered deterministic migration from every supported predecessor, validate a copy before publication, retain the prior known-good artifact until the migrated document opens successfully, and add machine-verifiable fixture/evidence. Unknown fields must either be explicitly preserved by a typed schema or rejected; they must never be silently discarded.
