# Project v2 IPC Bridge Traceability

## Problem

Project Persistence already owned a strict `projectFormatVersion: 2` document and a durable `preferences.selectedPlaybackSource` semantic, but the production desktop bridge still admitted and returned only the `RehearsalSong` compatibility view. A mounted Active Player therefore had no typed save/reopen path for `full_mix | vocals | bass | drums | other` without inventing a second WebView store or persisting a revocable `bandscope-playback` authority.

A later review of the renderer admission boundary found that its helper was named `isPlainRecord` but accepted any non-array object with the expected enumerable keys, including class instances with custom prototypes. Native Rust admission still failed closed on JSON shape, so this was not a demonstrated filesystem escape; it was nevertheless an avoidable mismatch between the documented exact JSON-record trust boundary and the renderer implementation.

## Constraints

- Project Persistence remains the only durable `.bscope` authority.
- Playback source persistence stores only the stable semantic; paths, native capability URLs, generation tokens and source-discovery receipts stay runtime-only.
- Legacy song-only desktop callers must continue to save and load without a breaking call-site migration; their deterministic preference remains `full_mix`.
- Unknown root/preference fields, prototype-bearing renderer records and runtime authority strings fail closed on renderer admission; native admission repeats the typed JSON boundary before persistence.
- This bridge does not claim that the mounted #1160 selector is already wired to Save/Reopen or that a reopened stem authority is reusable. Reopen must resolve the stored semantic against fresh native availability and mint a new authority.

## RED

Commit `ecc2904f55516806b51baa4bbafeef9d700b058c` adds a renderer bridge contract covering all five stable source semantics, round-trip load, rejection of a realistic `bandscope-playback://project-400-4/vocals?generation=7` authority and rejection of unknown preference fields. The predecessor `analysis.ts` exported neither `saveProjectDocument` nor `loadProjectDocument`, so this contract could not compile or pass.

Commit `3db1096baa52de34baa7fea4c1638185914d22b7` adds a focused renderer admission regression for custom-prototype outer documents and preference objects while retaining a positive ordinary JSON-shaped document case. The predecessor `isPlainRecord` accepted both prototype-bearing objects.

## Implementation

- `30bfa590df61a2b031076af81010f3e5f31372ea` adds the Project Persistence TypeScript anti-corruption boundary. It validates exact `{ song, preferences }` shape, parses the shared `RehearsalSong`, closes `selectedPlaybackSource` to the five durable semantics and rejects runtime-only/unknown state.
- `64613fbb604c4ddc6d156c84bc520dd8d40cef19` makes `saveProjectDocument` and `loadProjectDocument` cross the existing Tauri command boundary. Existing `saveProject(song)`/`loadProject()` remain compatibility adapters; song-only saves default to `full_mix` rather than fabricating a historical stem choice.
- `7f9d118b08038fd5473b71f0a1243136b39e04bc` changes native `save_project` to `project_document_from_value` + `project_content_for_document` and `load_project` to return `ProjectDocumentPayload` through `project_document_from_content`.
- Review of that native edit found one unrelated line accidentally changed in `remove_score_pdf`; `327c83f86c1ed213a1f6a58d382715e744ab9831` immediately restores the original project-scoped score root. That transient defect is not treated as valid product delta.
- `7cc4869560155039ff1e2e10d171505885dc39e3` makes renderer record admission match its stated JSON-record contract: only `Object.prototype` or null-prototype records are accepted, and prototype inspection failure itself fails closed. The durable field/domain contract is unchanged.

## Alternatives rejected

Persisting the opaque playback URL was rejected because its generation/session authority is intentionally revocable. Storing the preference in `localStorage` was rejected because it creates a second writable project truth. Adding stem preference fields to `RehearsalSong` was rejected because playback choice is project/UI preference, not MIR song evidence. Replacing the existing song-only APIs outright was rejected because unrelated current callers do not yet own Active Player source state. Treating arbitrary class instances as equivalent to JSON objects was rejected because custom prototypes have no durable `.bscope` semantics and expand the renderer-side trust surface without buyer value.

## Security Notes

**Attack surface.** Renderer IPC and reopened `.bscope` JSON are untrusted inputs; playback capability strings are also untrusted and must not become durable authority. Renderer values may originate from application code before serialization, so the renderer adapter must not silently admit prototype-bearing object shapes as if they were plain project records.

**Trust boundary.** The TypeScript adapter validates exact current-document shape before invoke/after load, while the Rust Project Persistence owner repeats strict typed admission before filesystem mutation and after bounded file read. Runtime playback authority is resolved later by the Active Player/native availability boundary.

**Mitigations.** Exact-key checks, plain-record prototype checks, the closed five-value source domain, `parseRehearsalSong`, Rust `deny_unknown_fields`, the v2 closed enum, bounded project reads and atomic publication prevent unknown/runtime state from being silently persisted. Prototype inspection exceptions fail closed. Song-only compatibility writes use the deterministic `full_mix` default.

**Test points.** The bridge contract exercises all five durable semantics, load round trip, runtime-authority rejection and unknown-field rejection. `projectDocument.plainRecord.test.ts` exercises custom-prototype rejection for both the outer document and nested preferences plus an ordinary JSON-shaped positive case. Existing Rust v2 fixtures/migration contracts continue to cover disk representation and legacy/v1 migration.

**Realistic threats.** A renderer bug or compromised WebView could attempt to persist an absolute path, stale playback capability URL, extra writable state or prototype-bearing object in place of the declared JSON record; a crafted project could return an unsupported source semantic. Both sides fail closed rather than treating those values as project truth.

**Remaining risk.** #1160 has not yet consumed `loadProjectDocument()` to restore selector intent, nor resolved that intent against fresh native source availability after reopen. More fundamentally, the current App clears `jobResultBootstrap` on project load, so a reopened project does not yet restore the source/bootstrap authority needed for audible playback after process restart. Selected-source composition must not be presented as complete until the Project Persistence source-reference boundary is defined and tested. Packaged Windows/macOS Save/Reopen acceptance and crash/power-loss evidence remain required.

## Effect

The persistence format and desktop IPC speak the same current v2 document without copying native path authority into the renderer contract, and renderer-side admission now matches the documented plain JSON-record boundary. This completes the v2 document bridge prerequisite itself; it does not complete source/bootstrap restoration, Active Player reopen interaction or #962 recovery/autosave scope.
