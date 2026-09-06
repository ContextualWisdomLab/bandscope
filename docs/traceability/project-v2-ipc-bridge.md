# Project v2 IPC Bridge Traceability

> Historical bridge slice. The bridge introduced for v2 remains in use, but current Project Persistence writes version 3 and can carry an optional path-free `sourceReference`. See `project-format-v3-source-reference.md` for the current source-reference boundary.

## Problem

Project Persistence had a strict v2 document and durable `preferences.selectedPlaybackSource`, but the production desktop bridge initially admitted and returned only the `RehearsalSong` compatibility view. Active Player therefore lacked one typed Save/Reopen path for `full_mix | vocals | bass | drums | other` without creating another WebView store or persisting a revocable `bandscope-playback` authority.

Later review found that renderer admission accepted custom-prototype objects, then that Proxy own-key/descriptor traps and accessor-backed fields could escape the stable validation contract or execute application-controlled getters. Those executable JavaScript shapes cannot originate from parsed JSON and have no durable `.bscope` meaning.

A further browser-preview review found a separate buyer-truth defect: when Tauri was absent, the browser fallback returned success for `save_project` even though no project bytes were persisted anywhere. Preview/browser tests could therefore observe a false successful-save outcome that production desktop persistence never performed.

After Resource Admission entered #970 ancestry, a second handoff defect remained: native selection retained a verified `LocalAudioPublicationIdentity`, but Save neither accepted an explicit project selector nor injected that retained identity into v3 immediately before serialization. The mounted App also lost the aggregate id between local-audio analysis and Save.

## Constraints

- Project Persistence remains the only durable `.bscope` authority.
- Resource Admission remains the owner of app-owned local-audio bytes, bounded byte evidence and SHA-256 publication identity.
- Renderer may select only an already-minted BandScope project id for Save; it may not submit a path, artifact name, byte count, digest, or `sourceReference`.
- Multiple project aggregates can coexist, so a global last-selected-project shortcut is not valid authority.
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
- Native handoff RED `cd3c67de8c9d35355aa30950733a1cf24a5d23fc` requires `save_project` to accept only an explicit optional project id, read `LocalAudioPublicationIdentityState`, use the typed Resource Admission → Project Persistence ACL, and avoid a global last-selected shortcut. Fix `ffdac30e63c4faa7264416bbeec8570a0c6543ff` adds `project_document_with_retained_source_reference`, performs exact native lookup by project id, revalidates through `project_source_reference_from_publication_identity`, and injects the result before serialization.
- Renderer-selector RED `570894b91f69b0e24c26090309fe5ee5d414f514` requires `saveProjectDocument(document, projectId)` to send only `{ payload, projectId }`. Fix `979ac4d3a948ab76a01e076fa29bece6161489d6` adds that optional selector while retaining the renderer-authored `sourceReference` rejection.
- Mounted-flow RED `28d94d0e9566030c53370829484f808f6763fbcf` requires an analyzed OS-selected local project to Save with its exact minted project id. Fix `06afcbe030ef1fb8d6b2097be0e40bc4d5c7c03a` tracks the local publication project id separately from generic bootstrap state, binds it to the submitted analysis result, clears it on load/failure/YouTube replacement, and passes it only when saving that local result. This avoids binding an old result to a newer selection and avoids sending YouTube ids that have no `LocalAudioPublicationIdentityState` entry.

## Alternatives rejected

Persisting the opaque playback URL was rejected because its authority is intentionally revocable. `localStorage` was rejected as a second writable project truth. Adding selection to `RehearsalSong` was rejected because it is UI/project preference, not MIR evidence. Arbitrary class/Proxy/accessor objects were rejected because executable object behavior has no `.bscope` semantics. Replacing compatibility APIs outright was rejected because unrelated callers do not necessarily own Active Player state. Pretending browser preview persisted a project was rejected because it produces unverifiable buyer-facing success and can make browser E2E pass without exercising the desktop durability boundary. A native or renderer-global last-selected project was rejected because it is stale-race-prone and cannot distinguish multiple aggregates. Sending a full `sourceReference` from the WebView was rejected because it would let renderer data impersonate Resource Admission evidence.

## Security Notes

**Attack surface.** Renderer IPC and reopened `.bscope` JSON are untrusted. Playback capabilities and any source locator are also untrusted and must not become durable authority merely because the renderer sees them.

**Trust boundary.** TypeScript validates the current project document before invoke and after load. For local-audio Save, the WebView can add only the already-minted project id selector. Tauri performs exact lookup in native `LocalAudioPublicationIdentityState`, revalidates the identity through the Project Persistence ACL, and injects the path-free `sourceReference` before serialization. Rust repeats strict typed admission before filesystem mutation and after bounded read. Active Player/resource admission mints runtime playback authority later. A browser preview without the Tauri bridge is outside the durable project-file boundary and cannot claim Save success.

**Mitigations.** Exact-key checks are exception-safe; plain-record checks reject custom prototypes; persisted values are read through own enumerable data-property descriptors; getters and descriptor traps do not become project data. The closed five-value preference, `parseRehearsalSong`, Rust `deny_unknown_fields`, bounded reads and crash-safe publication remain layered controls. Version 3's `sourceReference` is separately typed and path-free rather than being smuggled into this preference field. Browser fallback rejects project Save/Load instead of creating a second in-memory persistence truth. Local result-to-project association is captured at analysis submission rather than read from whatever source happens to be selected at Save time.

**Realistic threats.** A crafted renderer object can attempt to execute getters or Proxy traps during validation; stale global project selection can bind one result to another aggregate; a browser preview can falsely report persistence that never wrote bytes; a renderer can try to submit path/digest authority that belongs to native Resource Admission; or a reopened project can carry valid durable intent whose current audio/stem authority no longer exists.

**Test points.** Bridge tests cover all five preferences, load round trip, runtime-authority/unknown-field rejection, source-reference admission, invalid path-shaped reference fields, renderer-authored source-reference rejection before IPC, browser-preview Save fail-closed behavior, explicit project-id selector forwarding, native retained-identity lookup/injection, and mounted local-audio analysis → Save identity continuity. `projectDocument.plainRecord.test.ts` covers custom prototypes, proxy traps, accessor non-invocation, null-prototype acceptance and ordinary JSON records. Native format tests cover historical migration and current v3 source-reference shape.

**Logging/privacy.** Rejected object contents, trap text, local paths and project payloads are not forwarded as validation output. The public renderer error remains bounded rather than echoing attacker-controlled exceptions.

**Remaining risk.** The bridge and full-mix restart/content-identity path are now present in #970, but the persisted playback preference is still intent rather than fresh audible authority. #1160 must re-admit current Full mix/stem resources, reconcile the stored selection, and fall back to Full mix when a preferred stem is absent. Supported Windows/macOS mounted Save/Reopen, crash/recovery, downgrade/rollback and real-audio E2E remain release evidence gaps.

## Current effect and remaining risk

The desktop IPC and Project Persistence now speak the same typed current document; the historical song-only Tauri gap is closed. Current writes are v3, not v2. The document can carry both a stable playback preference and an optional path-free app-owned `sourceReference`. Browser preview no longer reports a successful project Save when it has no durable file authority.

Resource Admission #866 materializes OS-selected local audio into app-owned `project_root/source.<extension>`, verifies the published bytes against a bounded size+SHA-256 receipt, builds a path-free `LocalAudioPublicationIdentity`, and retains that identity in native state before renderer bootstrap authority is returned. Project Persistence #970 ordinarily adopted that implementation, exposes the typed `project_source_reference_from_publication_identity` ACL, injects the exact retained identity into v3 Save when the mounted local-analysis result supplies its minted project id, and on restart re-admits the app-owned artifact against persisted size and SHA-256 evidence before native source identity is restored. Production analysis then decodes a private snapshot verified against the retained evidence rather than trusting a later pathname reopen.

The principal remaining product gap is therefore Active Player authority reconciliation rather than durable full-mix identity. #1160 may resolve persisted `selectedPlaybackSource` only after fresh Full mix and current stem authorities exist and must fail closed to Full mix when a preferred stem is no longer available.

Packaged Windows/macOS Save/Reopen, crash/power-loss, autosave/recovery, downgrade/application rollback, current-stem re-admission, audible E2E and independent exact-head review evidence remain release gates.
