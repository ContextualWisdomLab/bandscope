# Project v2 IPC Bridge Traceability

## Problem

Project Persistence already owned a strict `projectFormatVersion: 2` document and a durable `preferences.selectedPlaybackSource` semantic, but the production desktop bridge still admitted and returned only the `RehearsalSong` compatibility view. A mounted Active Player therefore had no typed save/reopen path for `full_mix | vocals | bass | drums | other` without inventing a second WebView store or persisting a revocable `bandscope-playback` authority.

## Constraints

- Project Persistence remains the only durable `.bscope` authority.
- Playback source persistence stores only the stable semantic; paths, native capability URLs, generation tokens and source-discovery receipts stay runtime-only.
- Legacy song-only desktop callers must continue to save and load without a breaking call-site migration; their deterministic preference remains `full_mix`.
- Unknown root/preference fields and runtime authority strings fail closed on both renderer and native admission.
- This bridge does not claim that the mounted #1160 selector is already wired to Save/Reopen or that a reopened stem authority is reusable. Reopen must resolve the stored semantic against fresh native availability and mint a new authority.

## RED

Commit `ecc2904f55516806b51baa4bbafeef9d700b058c` adds a renderer bridge contract covering all five stable source semantics, round-trip load, rejection of a realistic `bandscope-playback://project-400-4/vocals?generation=7` authority and rejection of unknown preference fields. The predecessor `analysis.ts` exported neither `saveProjectDocument` nor `loadProjectDocument`, so this contract could not compile or pass.

## Implementation

- `30bfa590df61a2b031076af81010f3e5f31372ea` adds the Project Persistence TypeScript anti-corruption boundary. It validates exact `{ song, preferences }` shape, parses the shared `RehearsalSong`, closes `selectedPlaybackSource` to the five durable semantics and rejects runtime-only/unknown state.
- `64613fbb604c4ddc6d156c84bc520dd8d40cef19` makes `saveProjectDocument` and `loadProjectDocument` cross the existing Tauri command boundary. Existing `saveProject(song)`/`loadProject()` remain compatibility adapters; song-only saves default to `full_mix` rather than fabricating a historical stem choice.
- `7f9d118b08038fd5473b71f0a1243136b39e04bc` changes native `save_project` to `project_document_from_value` + `project_content_for_document` and `load_project` to return `ProjectDocumentPayload` through `project_document_from_content`.
- Review of that native edit found one unrelated line accidentally changed in `remove_score_pdf`; `327c83f86c1ed213a1f6a58d382715e744ab9831` immediately restores the original project-scoped score root. That transient defect is not treated as valid product delta.

## Alternatives rejected

Persisting the opaque playback URL was rejected because its generation/session authority is intentionally revocable. Storing the preference in `localStorage` was rejected because it creates a second writable project truth. Adding stem preference fields to `RehearsalSong` was rejected because playback choice is project/UI preference, not MIR song evidence. Replacing the existing song-only APIs outright was rejected because unrelated current callers do not yet own Active Player source state.

## Security Notes

**Attack surface.** Renderer IPC and reopened `.bscope` JSON are untrusted inputs; playback capability strings are also untrusted and must not become durable authority.

**Trust boundary.** The TypeScript adapter validates exact current-document shape before invoke/after load, while the Rust Project Persistence owner repeats strict typed admission before filesystem mutation and after bounded file read. Runtime playback authority is resolved later by the Active Player/native availability boundary.

**Mitigations.** Exact-key checks, the closed five-value source domain, `parseRehearsalSong`, Rust `deny_unknown_fields`, the v2 closed enum, bounded project reads and atomic publication prevent unknown/runtime state from being silently persisted. Song-only compatibility writes use the deterministic `full_mix` default.

**Test points.** The bridge contract exercises all five durable semantics, load round trip, runtime-authority rejection and unknown-field rejection. Existing Rust v2 fixtures/migration contracts continue to cover disk representation and legacy/v1 migration.

**Realistic threats.** A renderer bug or compromised WebView could attempt to persist an absolute path, stale playback capability URL or extra writable state; a crafted project could return an unsupported source semantic. Both sides fail closed rather than treating those values as project truth.

**Remaining risk.** #1160 has not yet consumed `loadProjectDocument()` to restore selector intent, nor resolved that intent against fresh native source availability after reopen. If a formerly selected stem is unavailable, the mounted player must fall back to Full mix without overwriting evidence until the Project Persistence/UI transaction is defined. Packaged Windows/macOS Save/Reopen acceptance and crash/power-loss evidence remain required.

## Effect

The persistence format and desktop IPC now speak the same current v2 document without copying native path authority into the renderer contract. This completes the persistence bridge prerequisite; it does not complete the Active Player reopen interaction or #962 recovery/autosave scope.
