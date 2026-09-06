# Project v2 IPC Bridge Traceability

> Historical bridge slice. The bridge introduced for v2 remains in use, but current Project Persistence writes version 3 and can carry an optional path-free `sourceReference`. See `project-format-v3-source-reference.md` for the current source-reference boundary.

## Problem

Project Persistence had a strict v2 document and durable `preferences.selectedPlaybackSource`, but the production desktop bridge initially admitted and returned only the `RehearsalSong` compatibility view. Active Player therefore lacked one typed Save/Reopen path for `full_mix | vocals | bass | drums | other` without creating another WebView store or persisting a revocable `bandscope-playback` authority.

Later review found that renderer admission accepted custom-prototype objects, then that Proxy own-key/descriptor traps and accessor-backed fields could escape the stable validation contract or execute application-controlled getters. Those executable JavaScript shapes cannot originate from parsed JSON and have no durable `.bscope` meaning.

A further browser-preview review found a separate buyer-truth defect: when Tauri was absent, the browser fallback returned success for `save_project` even though no project bytes were persisted anywhere. Preview/browser tests could therefore observe a false successful-save outcome that production desktop persistence never performed.

## Constraints

- Project Persistence remains the only durable `.bscope` authority.
- Playback selection persists only as a stable semantic; filesystem paths, native capability URLs, generation tokens and discovery receipts remain outside preference state.
- Song-only callers remain compatibility adapters and deterministically default to `full_mix` when they do not own a selection.
- Unknown fields, prototype-bearing records, accessors, enumeration/descriptor traps and runtime-authority strings fail closed before persistence IPC; native admission repeats the typed boundary.
- Browser preview has no durable project-file authority and must fail closed for Save/Load rather than simulate successful persistence.
- The bridge does not itself make a reopened stem playable. Stored intent must be combined with freshly re-admitted native audio availability.

## RED → fix evidence

- `ecc2904f55516806b51baa4bbafeef9d700b058c` added the renderer bridge RED for all five stable semantics, round-trip load, runtime-authority rejection and unknown preference fields.
- `30bfa590df61a2b031076af81010f3e5f31372ea` added the TypeScript Project Persistence anti-corruption boundary; `64613fbb604c4ddc6d156c84bc520dd8d40cef19` wired `saveProjectDocument`/`loadProjectDocument` through the existing Tauri command boundary.
- `7f9d118b08038fd5473b71f0a1243136b39e04bc` changed native `save_project` to strict current-document admission and `load_project` to return the typed current document. `327c83f86c1ed213a1f6a58d382715e744ab9831` immediately reverted an unrelated transient score-root edit found during review.
- `3db1096baa52de34baa7fea4c1638185914d22b7` added the custom-prototype RED; `7cc4869560155039ff1e2e10d171505885dc39e3` restricted admission to ordinary/null-prototype JSON records, and `3f4ce38c2be533a7b8bc90cd67b702d624cd3d1a` closed its edge coverage.
- `a71439d82932f671d8079c5f7c78b401679dcb6b` added Proxy/accessor REDs. `bc8e144355353e6311425afe734dfcf8e282ccd5` made exact-key enumeration exception-safe and required own enumerable data properties; `bc7e6c5877da9af6c9a349ea6e6c78c55eecec4e` added nested selection-accessor coverage.
- The later v3 source-reference extension preserves the same passive-record boundary: `f54be004887c11cd7a00065b7db86510e5c83ee8` adds the renderer source-reference contract, `04b4a93dbd7ecf5c6d3bdf4434f7908d06ffd73b` closes optional descriptor traps, and `c1cdcd036749a0a9231682db9446e5fbbe410d40` verifies source-reference getters/traps are not executed.
- Browser-persistence RED `6eea76fdb138838d61e8af0d23ea69d99012de21` requires Save without a Tauri invoke bridge to reject instead of reporting a success that wrote no bytes. Fix `cb7f4fd956278d1273e6be3f2df367171baadf9e` makes the browser fallback fail closed with `Local project save is not available in browser preview.` while leaving native Tauri persistence unchanged.

## Alternatives rejected

Persisting the opaque playback URL was rejected because its authority is intentionally revocable. `localStorage` was rejected as a second writable project truth. Adding selection to `RehearsalSong` was rejected because it is UI/project preference, not MIR evidence. Arbitrary class/Proxy/accessor objects were rejected because executable object behavior has no `.bscope` semantics. Replacing compatibility APIs outright was rejected because unrelated callers do not necessarily own Active Player state. Pretending browser preview persisted a project was rejected because it produces unverifiable buyer-facing success and can make browser E2E pass without exercising the desktop durability boundary.

## Security Notes

**Attack surface.** Renderer IPC and reopened `.bscope` JSON are untrusted. Playback capabilities and any source locator are also untrusted and must not become durable authority merely because the renderer sees them.

**Trust boundary.** TypeScript validates the current project document before invoke and after load; Rust repeats strict typed admission before filesystem mutation and after bounded read. Active Player/resource admission mints runtime playback authority later. A browser preview without the Tauri bridge is outside the durable project-file boundary and cannot claim Save success.

**Mitigations.** Exact-key checks are exception-safe; plain-record checks reject custom prototypes; persisted values are read through own enumerable data-property descriptors; getters and descriptor traps do not become project data. The closed five-value preference, `parseRehearsalSong`, Rust `deny_unknown_fields`, bounded reads and crash-safe publication remain layered controls. Version 3's `sourceReference` is separately typed and path-free rather than being smuggled into this preference field. Browser fallback rejects project Save/Load instead of creating a second in-memory persistence truth.

**Test points.** Bridge tests cover all five preferences, load round trip, runtime-authority/unknown-field rejection, source-reference admission, invalid path-shaped reference fields, renderer-authored source-reference rejection before IPC, and browser-preview Save fail-closed behavior. `projectDocument.plainRecord.test.ts` covers custom prototypes, proxy traps, accessor non-invocation, null-prototype acceptance and ordinary JSON records. Native format tests cover historical migration and current v3 source-reference shape.

**Logging/privacy.** Rejected object contents, trap text, local paths and project payloads are not forwarded as validation output. The public renderer error remains bounded rather than echoing attacker-controlled exceptions.

## Current effect and remaining risk

The desktop IPC and Project Persistence now speak the same typed current document; the historical song-only Tauri gap is closed. Current writes are v3, not v2. The document can carry both a stable playback preference and an optional path-free app-owned `sourceReference`. Browser preview no longer reports a successful project Save when it has no durable file authority.

Resource Admission #866 now materializes OS-selected local audio into app-owned `project_root/source.<extension>`, verifies the published bytes against a bounded size+SHA-256 receipt, builds a path-free `LocalAudioPublicationIdentity`, and retains that identity in native state before renderer bootstrap authority is returned. Project Persistence #970 has ordinarily adopted that implementation and exposes the typed `project_source_reference_from_publication_identity` ACL. The remaining v3 source-persistence gap is narrower: native `save_project` still does not look up the retained identity by an explicit project id and inject the resulting `sourceReference` immediately before serialization, and restart still does not re-admit the app-owned artifact to reconstruct fresh bootstrap/playback authority. #1160 may resolve persisted `selectedPlaybackSource` only after that fresh authority exists.

Packaged Windows/macOS Save/Reopen, crash/power-loss, autosave/recovery, downgrade/application rollback, restart source re-admission and independent exact-head review evidence remain release gates.
