# Project v2 IPC Bridge Traceability

> Historical bridge slice. The bridge introduced for v2 remains in use, but current Project Persistence writes version 3 and can carry an optional path-free `sourceReference`. See `project-format-v3-source-reference.md` for the current source-reference boundary.

## Problem

Project Persistence had a strict v2 document and durable `preferences.selectedPlaybackSource`, but the production desktop bridge initially admitted and returned only the `RehearsalSong` compatibility view. Active Player therefore lacked one typed Save/Reopen path for `full_mix | vocals | bass | drums | other` without creating another WebView store or persisting a revocable `bandscope-playback` authority.

Later review found that renderer admission accepted custom-prototype objects, then that Proxy own-key/descriptor traps and accessor-backed fields could escape the stable validation contract or execute application-controlled getters. Those executable JavaScript shapes cannot originate from parsed JSON and have no durable `.bscope` meaning.

## Constraints

- Project Persistence remains the only durable `.bscope` authority.
- Playback selection persists only as a stable semantic; filesystem paths, native capability URLs, generation tokens and discovery receipts remain outside preference state.
- Song-only callers remain compatibility adapters and deterministically default to `full_mix` when they do not own a selection.
- Unknown fields, prototype-bearing records, accessors, enumeration/descriptor traps and runtime-authority strings fail closed before persistence IPC; native admission repeats the typed boundary.
- The bridge does not itself make a reopened stem playable. Stored intent must be combined with freshly re-admitted native audio availability.

## RED → fix evidence

- `ecc2904f55516806b51baa4bbafeef9d700b058c` added the renderer bridge RED for all five stable semantics, round-trip load, runtime-authority rejection and unknown preference fields.
- `30bfa590df61a2b031076af81010f3e5f31372ea` added the TypeScript Project Persistence anti-corruption boundary; `64613fbb604c4ddc6d156c84bc520dd8d40cef19` wired `saveProjectDocument`/`loadProjectDocument` through the existing Tauri command boundary.
- `7f9d118b08038fd5473b71f0a1243136b39e04bc` changed native `save_project` to strict current-document admission and `load_project` to return the typed current document. `327c83f86c1ed213a1f6a58d382715e744ab9831` immediately reverted an unrelated transient score-root edit found during review.
- `3db1096baa52de34baa7fea4c1638185914d22b7` added the custom-prototype RED; `7cc4869560155039ff1e2e10d171505885dc39e3` restricted admission to ordinary/null-prototype JSON records, and `3f4ce38c2be533a7b8bc90cd67b702d624cd3d1a` closed its edge coverage.
- `a71439d82932f671d8079c5f7c78b401679dcb6b` added Proxy/accessor REDs. `bc8e144355353e6311425afe734dfcf8e282ccd5` made exact-key enumeration exception-safe and required own enumerable data properties; `bc7e6c5877da9af6c9a349ea6e6c78c55eecec4e` added nested selection-accessor coverage.
- The later v3 source-reference extension preserves the same passive-record boundary: `f54be004887c11cd7a00065b7db86510e5c83ee8` adds the renderer source-reference contract, `04b4a93dbd7ecf5c6d3bdf4434f7908d06ffd73b` closes optional descriptor traps, and `c1cdcd036749a0a9231682db9446e5fbbe410d40` verifies source-reference getters/traps are not executed.

## Alternatives rejected

Persisting the opaque playback URL was rejected because its authority is intentionally revocable. `localStorage` was rejected as a second writable project truth. Adding selection to `RehearsalSong` was rejected because it is UI/project preference, not MIR evidence. Arbitrary class/Proxy/accessor objects were rejected because executable object behavior has no `.bscope` semantics. Replacing compatibility APIs outright was rejected because unrelated callers do not necessarily own Active Player state.

## Security Notes

**Attack surface.** Renderer IPC and reopened `.bscope` JSON are untrusted. Playback capabilities and any source locator are also untrusted and must not become durable authority merely because the renderer sees them.

**Trust boundary.** TypeScript validates the current project document before invoke and after load; Rust repeats strict typed admission before filesystem mutation and after bounded read. Active Player/resource admission mints runtime playback authority later.

**Mitigations.** Exact-key checks are exception-safe; plain-record checks reject custom prototypes; persisted values are read through own enumerable data-property descriptors; getters and descriptor traps do not become project data. The closed five-value preference, `parseRehearsalSong`, Rust `deny_unknown_fields`, bounded reads and crash-safe publication remain layered controls. Version 3's `sourceReference` is separately typed and path-free rather than being smuggled into this preference field.

**Test points.** Bridge tests cover all five preferences, load round trip, runtime-authority/unknown-field rejection, source-reference admission, and invalid path-shaped reference fields. `projectDocument.plainRecord.test.ts` covers custom prototypes, proxy traps, accessor non-invocation, null-prototype acceptance and ordinary JSON records. Native format tests cover historical migration and current v3 source-reference shape.

**Logging/privacy.** Rejected object contents, trap text, local paths and project payloads are not forwarded as validation output. The public renderer error remains bounded rather than echoing attacker-controlled exceptions.

## Current effect and remaining risk

The desktop IPC and Project Persistence now speak the same typed current document; the historical song-only Tauri gap is closed. Current writes are v3, not v2. The document can carry both a stable playback preference and an optional path-free app-owned `sourceReference`.

Process-restart playback is nevertheless still incomplete. Current Resource Admission references the externally selected absolute source path and keeps bootstrap state in memory, while mounted project load clears `jobResultBootstrap`. #970/#962 must materialize the admitted full mix under the app-owned project namespace and reconstruct a fresh bootstrap from the validated v3 source reference. #1160 can then resolve the persisted semantic against fresh stem availability and fail closed to Full mix if the preferred stem no longer exists. Packaged Windows/macOS Save/Reopen, crash/power-loss, autosave/recovery and independent exact-head review evidence remain release gates.
