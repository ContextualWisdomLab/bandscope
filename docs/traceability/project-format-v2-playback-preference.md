# Project Format v2 Playback Preference Traceability

## Problem

The Active Player has a stable source semantic (`full_mix | vocals | bass | drums | other`) but Project Persistence version 1 stored only the rehearsal `song`. Reopening a project therefore had no durable place to record which admitted rehearsal source the user had selected. Persisting the mounted `bandscope-playback` URL instead would be incorrect because that URL is a revocable runtime authority tied to current native resource admission rather than durable project truth.

Version 2 established the durable preference, but its first compatibility surface still admitted only a `RehearsalSong` at the Tauri save boundary. A renderer therefore had no typed Project Persistence admission function that could accept an explicit stable source choice without either dropping it back to `full_mix` or bypassing the native format authority.

## Constraints

- #970/#962 remains the single Project Persistence owner. #1160 remains the Active Player/UI consumer and must not create a second localStorage, session, or file writer.
- Preserve strict historical v1 and legacy raw-song parsing. A v1 file contains no evidence that a stem was selected, so migration must not infer one.
- The persisted value is a closed rehearsal semantic only. Native playback URLs, absolute paths, generation tokens, and capability receipts stay runtime-only.
- Renderer IPC values are untrusted; an explicit current document must be admitted through typed Rust DTOs before any filesystem mutation.
- Unsupported future versions must fail explicitly before their body is interpreted as the current schema.
- Keep the existing historical core source in place rather than creating a large review-only move for a narrow format change.
- Version 2 is Draft code. Downgrade/rollback behavior and packaged cross-platform evidence remain release gates.

## RED → fix evidence

- RED `86207ea0459f1a6e27e80f571ad5d6462a0d6fab` adds `apps/desktop/core/tests/project_format_v2_playback_preference.rs`. The predecessor cannot compile because the current-document API and typed preference did not exist. The test requires deterministic v1/legacy migration to `full_mix`, round-trip preservation of all five stable semantics, rejection of unknown and `bandscope-playback` values, and a typed document constructor that needs no runtime authority.
- Causal implementation `be4ce61f9a865229aad9b46ad27adb79b1028258` introduces `project_format` as the current version/migration boundary and delegates historical v1/legacy validation to the existing strict parser.
- Review-surface repair `e95b1db4495df5d9c721271f9b8edc54840eb004` removes the temporary large source move. `apps/desktop/core/src/lib.rs` is restored byte-for-byte at its historical path; `src/crate_root.rs` includes it as the `core` module and re-exports the current v2 Project Persistence API. `Cargo.toml` changes only the library entry path. The net semantic delta from the predecessor is therefore the small crate-root adapter plus `project_format`, fixtures, tests, and documentation—not a copied 1,600-line implementation.
- Golden fixture `4aa18fa8cbe5e59cf3f1e195f9a20e51c36e4da7` adds `project-v2.json` with an explicit `vocals` preference. Fixture contract `73dc9a7314c0e20938fc767c207e4102e1bbf106` verifies that current-format round trips preserve it.
- Documentation alignment `9518d84eb621b03211a4ad5a164969268ae68cdd` updates `docs/engineering/local-project-format.md` to the version-2 envelope, ordered v1 migration, golden fixtures, runtime-authority separation, and remaining consumer/recovery gaps.
- Evidence-trigger RED `770942f006c80724a5cac970d17acae6da4a9d5b` proves the Windows Project Persistence lane would not run for `crate_root.rs`, `project_format.rs`, or the new `project_format*.rs` integration contracts. Causal workflow fix `72434d1026fe0a409bf291d91ead64d8b13f7959` adds those exact paths to both pull-request and protected-branch triggers without removing any prior input or reducing the Rust test command.
- IPC-admission RED `ed5dd9a05a4ceead5a48119d854d5fc06a7e0a1c` extends the external format contract with a renderer-shaped `{ song, preferences }` document. The predecessor cannot compile because `project_document_from_value` does not exist. The RED requires all five stable tokens to survive durable v2 serialization and rejects an unknown token, a realistic revocable `bandscope-playback://...` value, and an extra root `runtimeAuthority` field.
- Causal IPC fix `7711b4f938d6dd95dbd58a31595a3a7760834bdb` makes `ProjectDocumentPayload` a strict deserializable DTO and adds `project_document_from_value`. Root document, nested preferences, selected-source enum, and the existing rehearsal-song DTO now fail closed before publication when renderer IPC carries unknown or runtime-only state.

## Decision

Version 2 adds one typed top-level section:

```json
{
  "projectFormatVersion": 2,
  "song": { "...": "validated RehearsalSong" },
  "preferences": {
    "selectedPlaybackSource": "full_mix"
  }
}
```

`selectedPlaybackSource` accepts exactly `full_mix`, `vocals`, `bass`, `drums`, or `other`. V1 and legacy raw-song inputs migrate to `full_mix` because that is the only selection consistent with the absence of historical stem-selection evidence. Existing song-only save callers advance to v2 with the same deterministic default. The native core now also admits a strict renderer-shaped current document so the upcoming Tauri bridge can pass an explicit stable preference without accepting arbitrary JSON or runtime playback authority.

On reopen, the stored semantic is not sufficient authority to play audio. The consumer must ask the native Active Player/resource-admission boundary for current source availability, resolve a fresh opaque authority, and fall back to Full mix when the stored stem is unavailable.

## Alternatives rejected

- **Persist the current `bandscope-playback` URL** — rejected because a generation-bound capability is revocable runtime state, not portable project truth.
- **Keep the selected source inside the `song` DTO** — rejected because it is a project/UI preference, not MIR/rehearsal-song analysis truth, and would blur bounded-context ownership.
- **Use an arbitrary string preference or raw `serde_json::Value` as the storage DTO** — rejected because malformed, future, injected, or runtime-only values would survive as if they were current domain truth.
- **Deserialize only `preferences` and trust the separately parsed song** — rejected because it would create split admission semantics for one durable document and make unknown root fields invisible.
- **Infer the most recently generated stem during v1 migration** — rejected because the v1 artifact has no durable evidence for that claim. Deterministic `full_mix` is the only non-fabricated migration.
- **Create a WebView persistence store until the project format catches up** — rejected because it would establish a second writer and could disagree with the crash-safe project artifact after Save As, reopen, or recovery.
- **Keep the temporary `lib.rs` → `core.rs` file move** — rejected after reviewing the resulting diff. Although byte-equivalent, it expanded the review surface by roughly the whole historical core source without adding product behavior. The ordinary descendant repair keeps the source at its original path and uses a small crate-root adapter instead.
- **Rely on general cross-platform build checks while omitting the focused Windows persistence trigger** — rejected because #962 already owns a focused Windows evidence lane and format-contract changes must not silently skip it due to stale path filters.

## Effect

The canonical Project Persistence branch now has a typed current document with a versioned preference boundary, executable v1/legacy migration, and a strict native admission function for renderer-supplied current documents. This closes the schema/authority prerequisite for passing an explicit stable source through Tauri without persisting runtime media capability data.

This does not yet mean that a user-selected stem survives reopen. The current `save_project` command still accepts only `RehearsalSong` and therefore writes the compatibility `full_mix` default; `load_project` still returns only the song compatibility view. The next consumer slice must wire these commands and #1160 to the current document API, then resolve the restored semantic against fresh native availability.

## Security Notes

### Attack surface and trust boundary

`.bscope` bytes and renderer IPC values are untrusted local input. The preference is admitted only through the native Project Persistence format boundary. Runtime playback authorities originate from native resource admission and remain outside the durable document. The renderer does not gain permission to mint or persist a playback URL merely because it can choose a stable semantic.

### Validation and fail-closed behavior

The v2 disk envelope uses `deny_unknown_fields`; the renderer-facing `ProjectDocumentPayload` and nested `ProjectPreferencesPayload` also use `deny_unknown_fields`; `selectedPlaybackSource` is a serde enum with five accepted tokens; and the rehearsal song remains governed by the strict typed DTO. Unknown root fields, unknown preference fields, unknown source values, and a literal `bandscope-playback://...` value fail parsing before filesystem publication. V1/legacy inputs reuse the already hardened strict song parser rather than a permissive migration. Future versions return `Unsupported project format version: <n>` before their future body is interpreted as v2.

### Logging and privacy

Migration and IPC-admission errors are bounded format/validation errors. They do not need to echo project paths, song content, collaboration text, media URLs, credentials, or audio metadata. The v2 preference itself contains no path or resource locator.

### Test points

The RED/fix suite covers v1 migration, legacy migration, every valid source token, unknown tokens, a realistic revocable playback URL, typed construction without runtime authority, checked-in v2 golden fixture, renderer-shaped current-document admission, and rejection of extra runtime authority at the IPC document root. Existing Project Persistence tests continue to own bounded I/O, symlink/reparse checks, native identity, atomic publication/recovery, permission normalization, and the 5 MiB ceiling. The focused Windows workflow policy test also pins every Rust format source, format integration test, golden fixture, Tauri persistence source, and manifest/lock input that must wake the platform-specific persistence lane.

### Remaining risk

The current Tauri `save_project` and `load_project` commands still expose the song-only compatibility view, so an explicit Active Player preference is not yet carried through Save/Reopen. Reopen resolution/fallback has not yet been proven end to end. Version 2 also does not complete autosave, backup rotation, startup recovery discovery, migration receipts/hashes, downgrade behavior, descriptor-bound parent authority, or exhaustive power-loss injection. The PR must remain Draft until exact-head cross-platform checks and independent review cover the unchanged source.
