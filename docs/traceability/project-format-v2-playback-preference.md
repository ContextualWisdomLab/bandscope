# Project Format v2 Playback Preference Traceability

## Problem

The Active Player has a stable source semantic (`full_mix | vocals | bass | drums | other`) but Project Persistence version 1 stored only the rehearsal `song`. Reopening a project therefore had no durable place to record which admitted rehearsal source the user had selected. Persisting the mounted `bandscope-playback` URL instead would be incorrect because that URL is a revocable runtime authority tied to current native resource admission rather than durable project truth.

## Constraints

- #970/#962 remains the single Project Persistence owner. #1160 remains the Active Player/UI consumer and must not create a second localStorage, session, or file writer.
- Preserve strict historical v1 and legacy raw-song parsing. A v1 file contains no evidence that a stem was selected, so migration must not infer one.
- The persisted value is a closed rehearsal semantic only. Native playback URLs, absolute paths, generation tokens, and capability receipts stay runtime-only.
- Unsupported future versions must fail explicitly before their body is interpreted as the current schema.
- Keep the existing historical core source in place rather than creating a large review-only move for a narrow format change.
- Version 2 is Draft code. Downgrade/rollback behavior and packaged cross-platform evidence remain release gates.

## RED → fix evidence

- RED `86207ea0459f1a6e27e80f571ad5d6462a0d6fab` adds `apps/desktop/core/tests/project_format_v2_playback_preference.rs`. The predecessor cannot compile because the current-document API and typed preference did not exist. The test requires deterministic v1/legacy migration to `full_mix`, round-trip preservation of all five stable semantics, rejection of unknown and `bandscope-playback` values, and a typed document constructor that needs no runtime authority.
- Causal implementation `be4ce61f9a865229aad9b46ad27adb79b1028258` introduces `project_format` as the current version/migration boundary and delegates historical v1/legacy validation to the existing strict parser.
- Review-surface repair `e95b1db4495df5d9c721271f9b8edc54840eb004` removes the temporary large source move. `apps/desktop/core/src/lib.rs` is restored byte-for-byte at its historical path; `src/crate_root.rs` includes it as the `core` module and re-exports the current v2 Project Persistence API. `Cargo.toml` changes only the library entry path. The net semantic delta from the predecessor is therefore the small crate-root adapter plus `project_format`, fixtures, tests, and documentation—not a copied 1,600-line implementation.
- Golden fixture `4aa18fa8cbe5e59cf3f1e195f9a20e51c36e4da7` adds `project-v2.json` with an explicit `vocals` preference. Fixture contract `73dc9a7314c0e20938fc767c207e4102e1bbf106` verifies that current-format round trips preserve it.
- Documentation alignment `9518d84eb621b03211a4ad5a164969268ae68cdd` updates `docs/engineering/local-project-format.md` to the version-2 envelope, ordered v1 migration, golden fixtures, runtime-authority separation, and remaining consumer/recovery gaps.

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

`selectedPlaybackSource` accepts exactly `full_mix`, `vocals`, `bass`, `drums`, or `other`. V1 and legacy raw-song inputs migrate to `full_mix` because that is the only selection consistent with the absence of historical stem-selection evidence. Existing song-only save callers advance to v2 with the same deterministic default; the typed document API exists for the Active Player bridge to supply an explicit stable preference in the next consumer slice.

On reopen, the stored semantic is not sufficient authority to play audio. The consumer must ask the native Active Player/resource-admission boundary for current source availability, resolve a fresh opaque authority, and fall back to Full mix when the stored stem is unavailable.

## Alternatives rejected

- **Persist the current `bandscope-playback` URL** — rejected because a generation-bound capability is revocable runtime state, not portable project truth.
- **Keep the selected source inside the `song` DTO** — rejected because it is a project/UI preference, not MIR/rehearsal-song analysis truth, and would blur bounded-context ownership.
- **Use an arbitrary string preference** — rejected because malformed, future, or injected values would survive as if they were current domain truth.
- **Infer the most recently generated stem during v1 migration** — rejected because the v1 artifact has no durable evidence for that claim. Deterministic `full_mix` is the only non-fabricated migration.
- **Create a WebView persistence store until the project format catches up** — rejected because it would establish a second writer and could disagree with the crash-safe project artifact after Save As, reopen, or recovery.
- **Keep the temporary `lib.rs` → `core.rs` file move** — rejected after reviewing the resulting diff. Although byte-equivalent, it expanded the review surface by roughly the whole historical core source without adding product behavior. The ordinary descendant repair keeps the source at its original path and uses a small crate-root adapter instead.

## Effect

The canonical Project Persistence branch now has a typed current document with a versioned preference boundary and executable v1/legacy migration. Current Tauri song-only saves can emit a v2 document without persisting runtime media capability data. The change does not yet mean that a user-selected stem survives reopen: the #1160 consumer still has to pass the stable selection into the typed document, and reload still has to resolve it against fresh native availability.

## Security Notes

### Attack surface and trust boundary

`.bscope` bytes remain untrusted local input. The new preference is admitted only after the versioned envelope crosses the native Project Persistence parser. Runtime playback authorities originate from native resource admission and remain outside the durable document. The renderer does not gain permission to mint or persist a playback URL merely because it can choose a stable semantic.

### Validation and fail-closed behavior

The v2 envelope uses `deny_unknown_fields`; `selectedPlaybackSource` is a serde enum with five accepted tokens. Unknown values and a literal `bandscope-playback://...` value fail parsing. V1/legacy inputs reuse the already hardened strict song parser rather than a permissive `serde_json::Value` migration. Future versions return `Unsupported project format version: <n>` before their future body is interpreted as v2.

### Logging and privacy

Migration errors are bounded format/version errors. They do not need to echo project paths, song content, collaboration text, media URLs, credentials, or audio metadata. The v2 preference itself contains no path or resource locator.

### Test points

The RED/fix suite covers v1 migration, legacy migration, every valid source token, unknown tokens, a realistic revocable playback URL, typed construction without runtime authority, and the checked-in v2 golden fixture. Existing Project Persistence tests continue to own bounded I/O, symlink/reparse checks, native identity, atomic publication/recovery, permission normalization, and the 5 MiB ceiling.

### Remaining risk

The current compatibility save command still receives only `RehearsalSong`, so it writes `full_mix` until the Active Player consumer is wired to the typed document API. Reopen resolution/fallback has not yet been proven end to end. Version 2 also does not complete autosave, backup rotation, startup recovery discovery, migration receipts/hashes, downgrade behavior, descriptor-bound parent authority, or exhaustive power-loss injection. The PR must remain Draft until exact-head cross-platform checks and independent review cover the unchanged source.
