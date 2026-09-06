# Project Format v2 Playback Preference Traceability

> Historical slice. Version 2 established the durable Active Player selection semantic. Current writes are `projectFormatVersion: 3`; see `docs/traceability/project-format-v3-source-reference.md`. This document preserves the v2 decision/evidence chain and must not be read as the current on-disk contract.

## Problem

Project Persistence version 1 stored only the rehearsal `song`, while Active Player needed one durable source semantic: `full_mix | vocals | bass | drums | other`. Persisting a mounted `bandscope-playback` URL would have been incorrect because that URL is a revocable native runtime authority, not project truth.

The first v2 compatibility surface also exposed only a `RehearsalSong` through Tauri, so a renderer could not yet carry an explicit stable selection through the canonical Project Persistence admission boundary.

## Constraints

- #970/#962 remains the single Project Persistence owner; #1160 is an Active Player/UI consumer and must not create another localStorage/session/file writer.
- Historical v1 and legacy raw-song parsing remains strict. Missing historical selection evidence migrates deterministically to `full_mix`.
- Playback preference is a closed semantic. Native playback URLs, filesystem paths, generation tokens, and capability receipts remain outside durable preference state.
- Renderer IPC input is untrusted and must pass typed native admission before filesystem mutation.
- Unsupported future versions fail explicitly before their body is interpreted as current truth.

## RED → fix evidence

- RED `86207ea0459f1a6e27e80f571ad5d6462a0d6fab` added `apps/desktop/core/tests/project_format_v2_playback_preference.rs`. The predecessor lacked the current-document API and typed preference. The test required deterministic v1/legacy migration to `full_mix`, round-trip preservation of all five semantics, rejection of unknown and `bandscope-playback` values, and construction without runtime authority.
- Causal implementation `be4ce61f9a865229aad9b46ad27adb79b1028258` introduced `project_format` as the then-current migration boundary while delegating historical song validation to the existing strict parser.
- Review-surface repair `e95b1db4495df5d9c721271f9b8edc54840eb004` restored the historical core source to `apps/desktop/core/src/lib.rs` and kept the new public surface in a small crate-root adapter rather than carrying a large file move.
- Golden fixture `4aa18fa8cbe5e59cf3f1e195f9a20e51c36e4da7` added `project-v2.json` with `vocals`; `73dc9a7314c0e20938fc767c207e4102e1bbf106` verified round-trip preservation.
- Evidence-trigger RED `770942f006c80724a5cac970d17acae6da4a9d5b` showed the focused Windows lane omitted the new format inputs. `72434d1026fe0a409bf291d91ead64d8b13f7959` added those paths without reducing its Rust test command.
- IPC-admission RED `ed5dd9a05a4ceead5a48119d854d5fc06a7e0a1c` required strict renderer-shaped `{ song, preferences }` admission. `7711b4f938d6dd95dbd58a31595a3a7760834bdb` implemented it and `4f076ce7c2a03b455409a318d045f526492497f6` repaired the missing public re-export.
- After the later v3 advance, fresh review found this v2 test still hard-coded serialized version `2` and instantiated `ProjectDocumentPayload` without the new optional field. `ace91a29e540919d02716dd492e290f9743422a8` made output assertions use `CURRENT_PROJECT_FORMAT_VERSION`, verified that v1/v2/legacy migration does not invent `sourceReference`, and preserved v2 as an input contract rather than current output truth.

## Historical decision

Version 2 introduced:

```json
{
  "projectFormatVersion": 2,
  "song": { "...": "validated RehearsalSong" },
  "preferences": {
    "selectedPlaybackSource": "full_mix"
  }
}
```

`selectedPlaybackSource` accepts exactly `full_mix`, `vocals`, `bass`, `drums`, or `other`. V1 and legacy inputs migrate to `full_mix` because they contain no durable evidence for a stem selection. A stored semantic never grants playback authority; reopen must resolve it against fresh native resource availability.

## Alternatives rejected

- **Persist the current `bandscope-playback` URL** — generation-bound capability is revocable runtime state.
- **Put the selection inside `song`** — it is project/UI preference, not MIR/rehearsal-song truth.
- **Use arbitrary strings or raw JSON** — malformed/future/runtime-only values would be accepted as domain truth.
- **Split song and preference admission** — one durable document would gain two inconsistent trust boundaries.
- **Infer the latest generated stem during migration** — historical artifacts contain no evidence for that claim.
- **Create a WebView persistence store** — that would create a second writer capable of disagreeing with the crash-safe project artifact.

## Current effect

The v2 decision survives in current v3 as the same closed `preferences.selectedPlaybackSource` domain and deterministic historical migration rule. Tauri `save_project`/`load_project` now admit/return the typed current document rather than the old song-only compatibility view, so the historical bridge gap described above has been superseded.

Version 3 adds a separate optional path-free app-owned `sourceReference`. That field is deliberately not a playback authority and is not inferred for v2/v1/legacy projects. #970 now re-admits the app-owned full mix on restart against the persisted size and SHA-256 evidence and binds production analysis decode to a verified private byte snapshot. The remaining Active Player work is to reconcile durable `selectedPlaybackSource` intent with fresh Full mix/current-stem audible authorities under #1160.

## Security Notes

### Attack surface and trust boundary

`.bscope` bytes and renderer IPC values are untrusted local input. Playback preference is admitted through Project Persistence only. Native resource admission remains the authority for playback capabilities.

### Validation and fail-closed behavior

The historical v2 envelope and current preference DTO use `deny_unknown_fields`; selection is a five-value enum; the rehearsal song remains strict typed data. Unknown root/preference values and literal `bandscope-playback://...` values fail before publication. Current v3 adds a separately typed source-reference boundary rather than weakening this preference contract.

### Mitigations

Keep durable playback intent as the closed five-value semantic, reject runtime capability strings and unknown fields at both renderer and native admission, migrate evidence-free historical projects deterministically to `full_mix`, and require fresh Resource Admission/Active Player authority before a stored stem preference becomes playable.

### Realistic threats

- a crafted project stores a filesystem path or revocable playback URL as if it were durable playback truth;
- a future or malformed preference token is accepted and later interpreted differently by renderer and native code;
- a historical project is migrated by guessing a stem selection that the artifact never recorded;
- a valid persisted stem preference is replayed after restart without checking whether that stem is currently admitted and audible.

### Logging and privacy

Preference/migration errors are bounded validation errors and need not echo project paths, song/collaboration content, media URLs, credentials, or audio metadata. The preference itself contains no locator.

### Test points

`project_format_v2_playback_preference.rs` continues to cover v1/legacy migration, every valid source token, invalid/revocable tokens, typed construction without runtime authority, and renderer-shaped admission. Its current-output assertions are version-aware so v2 remains verified as a supported predecessor instead of pretending to be the current writer.

### Remaining risk

The preference schema and full-mix restart/content identity path are no longer the blocker. Remaining work is primarily Active Player and release evidence: reconcile the durable selection against freshly admitted Full mix and current stem artifacts, fail closed to Full mix when a preferred stem is unavailable, complete mounted Save/Reopen and audible E2E on supported Windows/macOS packages, and retain crash/recovery/downgrade evidence and independent exact-head review before merge/release.
