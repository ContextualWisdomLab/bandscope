# Issue 33 Audio Intake Bootstrap Design

## Context

Issue `#32` delivered a secure local orchestration path using typed Tauri IPC plus a Python subprocess over stdin/stdout. The remaining gap before real analysis is local audio intake: the desktop app still launches only a demo request, there is no file-picker flow, no validated local source descriptor, and no app-owned project bootstrap record for selected audio.

## Constraints

- `docs/security/app-security.md` treats local files and metadata as untrusted input and requires path normalization, app-owned temp/cache directories, and safe failure.
- The orchestration boundary from `#32` should remain the transport baseline: React -> Tauri IPC -> Rust -> Python subprocess.
- `#33` should bootstrap a project around a selected audio file without expanding into waveform extraction, ffmpeg, or persistent project save/load.
- UI copy must stay rehearsal-first and avoid raw absolute path leakage.

## Approaches

### Approach 1: Reference-only project bootstrap

The user selects a local audio file through Tauri. Rust validates the file, creates app-owned temp/cache/project directories, and stores a typed project/source descriptor that references the original file path.

Trade-offs:
- Pros: smallest secure step, minimal storage cost, fastest path to a real intake flow.
- Cons: the project depends on the original file remaining in place.

### Approach 2: Copy-on-import bootstrap

The selected file is copied into an app-owned project intake folder immediately.

Trade-offs:
- Pros: stronger isolation, more stable project identity.
- Cons: larger scope, bigger disk use, more cleanup and error-handling complexity.

### Approach 3: Full persisted project format now

Introduce intake, save/load, and migration-ready project persistence together.

Trade-offs:
- Pros: future-proof persistence design.
- Cons: scope explosion; overlaps too heavily with issue `#27`.

## Decision

Use approach 1.

Issue `#33` will add a local-file picker, validation, and typed project bootstrap that references the original source file while creating app-owned temp/cache/project directories. The engine will accept a new local-audio source descriptor but still return the current demo rehearsal-song payload after validating the source.

## Architecture

- React calls a new `select_local_audio_source` bridge helper.
- Tauri opens a file dialog with a narrow audio extension allowlist.
- Rust validates file existence, canonicalizes the path, checks extension and metadata baseline, creates app-owned directories, and returns a typed `LocalAudioSource` plus `ProjectBootstrapSummary`.
- React then calls the existing orchestration path with `sourceKind: "local_audio"` and the new source metadata.
- Python validates the expanded request shape and returns a structured success or invalid-request failure.

## Data Model

Shared contracts will expand to include:
- `AnalysisSourceKind = "demo" | "local_audio"`
- `LocalAudioSource`
- `ProjectBootstrapSummary`
- updated `AnalysisJobRequest` containing an optional `localSource` payload when `sourceKind` is `local_audio`

## Error Handling

- Unsupported extensions fail before orchestration starts.
- Missing or unreadable selected files fail with safe, rehearsal-first copy.
- Unknown or malformed `localSource` fields fail at TypeScript, Rust, and Python boundaries.
- UI-visible failures avoid raw canonical paths and engine stderr.

## Testing

- Shared-types tests for the expanded request and source/bootstrap types.
- Desktop tests for file-selection happy path and invalid selection failure.
- Python tests for local-audio request validation.
- Rust compile check and full quickcheck.

## Security Notes

### Attack surface

- file dialog selection payload
- Rust path normalization and metadata handling
- Python validation of local-source request payloads

### Trust boundary

- user-selected file -> Rust intake validation -> Python subprocess request validation

### Mitigations

- extension allowlist
- canonical path normalization
- app-owned temp/cache/project roots only
- no generic filesystem read/write API exposure
- redacted user-safe failure messages

### Test points

- unsupported extension rejection
- missing file rejection
- malformed local-source payload rejection at all layers
- project bootstrap directories created only under app-owned roots

### Remaining risk

- the project still references the original file and will fail if the file moves; that portability problem is deferred to issue `#27`.
