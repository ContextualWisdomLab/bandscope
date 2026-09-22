# Local Project Format

This document specifies the format and lifecycle of a BandScope `.bscope` project file, focusing on data persistence, manual overrides, durable rehearsal preferences, source re-admission, and recovery.

## Overview

BandScope projects are saved as `.bscope` files. Current writes use a strict JSON envelope with `projectFormatVersion: 3`. The nested `song` remains the compatibility view used by the desktop rehearsal contract, `preferences` stores durable rehearsal UI intent, and the optional `sourceReference` is the typed handle for locating and verifying an app-owned full-mix artifact after process restart.

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
    "fileSizeBytes": 4096,
    "contentSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

`selectedPlaybackSource` is a closed durable semantic with exactly these values: `full_mix`, `vocals`, `bass`, `drums`, or `other`. It is not a media URL, local path, generation receipt, or native playback authority. An opaque `bandscope-playback` authority is runtime-only and must never appear in a `.bscope` file.

`sourceReference` is optional because historical projects and compatibility callers do not have enough evidence to invent one. When present, it is restricted to an opaque BandScope `projectId`, the fixed app-owned artifact name `source.<extension>`, one of `wav | mp3 | flac | m4a`, a non-zero byte length, and a canonical lowercase SHA-256 digest of the admitted app-owned source bytes. It contains no source path. `fileSizeBytes` is bounded preflight evidence; it is not sufficient content identity. `contentSha256` is recomputed by native Resource Admission before an app-owned source is accepted after restart.

The native `save_project`/`load_project` commands admit and return the complete typed current document, and the TypeScript Project Persistence adapter exposes `saveProjectDocument`/`loadProjectDocument` with the same closed preference/source-reference domains. Existing song-only `saveProject`/`loadProject` callers remain compatibility adapters and do not invent a source reference. Active Player still has to resolve the reopened semantic through freshly re-admitted native Full mix/current-stem availability rather than treating the persisted semantic as audible authority.

`tempo` and `collaboration` are optional song fields. The native persistence boundary preserves the current shared collaboration contract and its assignment/comment/approval state domains. Role records also preserve optional `harmonicExplanation`, `transpositionPlan`, `transcription`, and integer `practiceProgress` from 0 through 100. These fields are typed project data; unknown fields still fail closed rather than being retained in an untyped JSON bag.

The project format version is independent of the application package version. Version 3 rejects unknown envelope fields, invalid preference tokens, user-path-shaped source reference fields, mismatched artifact names/extensions, invalid project ids, zero-length source evidence, and non-canonical or missing SHA-256 content identity. A well-formed unsupported future version returns an explicit unsupported-version error before its body is interpreted as current truth.

Checked-in compatibility evidence:

- `apps/desktop/core/testdata/project-v1.json` — supported version-1 input.
- `apps/desktop/core/testdata/project-v2.json` — supported version-2 document with an explicit `vocals` preference.
- `apps/desktop/core/tests/project_format_v2_playback_preference.rs` — legacy/v1 migration and closed preference-domain contracts.
- `apps/desktop/core/tests/project_format_v2_fixture.rs` — version-2 fixture migration, validated canonical-copy preparation, content-addressed migration receipt, idempotent current serialization, and selected-source preservation.
- `apps/desktop/core/tests/project_format_v3_source_reference.rs` — current source-reference round trip, v2 migration, path/shape rejection, and canonical SHA-256 requirements.
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

`prepare_project_migration` is the canonical migration-copy preparation boundary. It uses the same version dispatch, hashes the exact input bytes, serializes the admitted typed document through the canonical v3 writer, hashes those exact candidate bytes, reopens the candidate through the current parser, and requires the reopened document to serialize byte-for-byte identically before returning `PreparedProjectMigration`. The returned value contains the current typed document, the validated canonical candidate bytes, and `ProjectMigrationReceipt`: source version (`None` only for legacy unversioned input), target version, exact input SHA-256, exact canonical-output SHA-256, and `migrated`. Re-preparing those canonical bytes yields source version 3, `migrated = false`, and the same bytes/digest. `project_document_with_migration_receipt` is a compatibility wrapper over the same preparation boundary, not a second parser.

The prepared candidate and receipt are deterministic transformation evidence. They are not a signature, backup, filesystem-publication receipt, or proof that recovery completed. Production `load_project` still reads and admits a document without publishing the prepared v3 copy back to disk, so migration-on-copy publication remains a separate Project Persistence step.

The SHA-256 source-reference requirement was tightened while version 3 remained Draft/unreleased in #970. No released BandScope project format has depended on the earlier size-only v3 draft. This avoids creating a second same-version interpretation and keeps the future released v3 contract singular.

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

## Security Notes

When loading `.bscope` files from disk, BandScope applies these constraints:

1. **Size limit** — a project file may not exceed 5 MiB (`5 * 1024 * 1024` bytes) at the current Tauri persistence boundary.
2. **Strict schema validation** — current and historical envelopes plus the rehearsal song contract reject unknown fields according to their published compatibility rule. Playback preference, source reference, collaboration state, provenance, cue, role, export, and progress domains are typed rather than arbitrary strings.
3. **Bounded processing** — project JSON is parsed as data only. The format contains no executable code or runtime playback URL.
4. **Runtime-authority separation** — a selected playback source is stored only as a stable semantic. Reopening must request a fresh native authority from current resource availability rather than trusting persisted media capability data.
5. **Filesystem-authority separation** — `sourceReference` cannot carry an absolute/relative user path. Native code derives the app-owned artifact from the validated project id and fixed artifact basename and validates the artifact without following persisted path input.
6. **Content-identity separation** — `fileSizeBytes` is not treated as identity. Re-admission compares bounded byte length and recomputes SHA-256 over the derived app-owned audio before the source is accepted. The persisted digest is required to be exactly 64 lowercase hexadecimal characters, but syntactic validity alone never grants file authority.
7. **Purpose-bound metadata** — the source reference does not persist the user's original filesystem location. Project id, fixed artifact name, byte length, and SHA-256 exist only to locate and verify BandScope-owned audio needed for rehearsal reopen.
8. **Migration evidence separation** — migration receipts contain only source/target versions and content digests. `PreparedProjectMigration` keeps current canonical publication bytes in memory but neither contract includes a filesystem path, user identity, runtime playback authority, or a claim that publication/recovery completed. A candidate must reopen as current v3 and reproduce identical canonical bytes before the preparation boundary returns it.

## Current boundary and next migration slices

Version 3, retained native publication identity, Save injection, and restart re-admission now form one path-free full-mix continuity contract. Resource Admission materializes the admitted source as app-owned `source.<extension>`, records exact size/SHA-256 evidence, Project Persistence stores only that identity in `sourceReference`, and restart derives and rechecks the app-owned artifact before restoring native source identity. Production analysis then consumes a verified private byte snapshot rather than trusting a later pathname reopen.

This does not make the full rehearsal workspace release-ready. Active Player must still reconcile persisted `selectedPlaybackSource` with fresh Full mix/current-stem authorities and fail closed to Full mix when the preferred stem is absent. Descriptor-bound ancestor authority remains incomplete on all supported paths. YouTube durable-source policy and decoder licensing remain separate owners.

The migration core now closes both deterministic source/target/input/output evidence and validated current-version copy preparation. The remaining migration durability slice is filesystem orchestration: bind `PreparedProjectMigration` to the selected target's admitted file identity, retain a verified pre-migration known-good artifact, publish only while that identity remains the expected predecessor, reopen the published candidate, and retain/restore the known-good artifact if publication or reopen verification fails. Downgrade/application-rollback behavior must also be explicit. Bounded autosave, known-good backup rotation, global startup recovery discovery, accessible Restore / Compare / Discard UX, and exhaustive interruption/disk-full/power-loss fault injection remain open under #962.

## Extensibility

Each future `.bscope` version must have an ordered deterministic migration from every supported predecessor, validate a copy before publication, retain the prior known-good artifact until the new version opens successfully, and add machine-verifiable fixture/evidence. Unknown fields must either be explicitly preserved by a typed schema or rejected; they must never be silently discarded.
