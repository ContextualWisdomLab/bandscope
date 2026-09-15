# Updater transport admission traceability

Status: implemented policy boundary; production network adapter still pending.

## Problem

BandScope already has a strict provisional updater-metadata parser and a bounded streaming/staging primitive, but those two boundaries were not connected by an executable transport policy. A future HTTP adapter could therefore reparse `raw_json`, allow the HTTP library to follow redirects implicitly, hand transformed response bytes to staging, or fail to prove which effective URL produced them.

GitHub's REST release-asset contract requires clients requesting binary asset content to handle either a direct `200` response or a `302` redirect. That makes "disable every redirect" incompatible with the supported release path, while unconstrained automatic redirects would make the final network destination an HTTP-library decision rather than a Distribution decision.

Tauri's updater CLI writes the textual minisign signature box as standard-base64 text into the `.sig` artifact, and the updater runtime first base64-decodes the manifest `signature` back to UTF-8 before parsing/verifying the signature box. Merely bounding a remote signature string therefore leaves malformed envelopes to fail only after network/download work unless BandScope rejects them earlier. The manifest is one four-target release document: validating only the currently selected target would let one platform accept metadata containing an impossible Tauri signature envelope for another supported platform. That creates target-dependent structural acceptance for what is supposed to be one release truth.

Updater signatures and SHA-256 evidence are defined over the exact published artifact bytes. HTTP content codings such as gzip or brotli can make an HTTP stack expose decoded bytes that differ from the wire representation while `Content-Length` still describes the encoded body. Distribution must therefore reject transformed response bodies before filesystem mutation rather than depend on client-specific automatic decompression behavior.

A redirect decision is also state, not merely a URL string. Before the current repair, an `AdmittedRedirect` was bound only to the initial release URL and redirect location. Two provisional metadata projections using the same release URL but different size, digest, or updater signature could therefore exchange the redirect token: `admit_redirect_response` would accept the old CDN location under the new policy and emit a download head carrying the new provisional identity. That did not by itself create cryptographic trust, but it broke attempt-level evidence continuity and made later authenticated descriptor binding harder to reason about.

## Constraints

- Consume `ProvisionalUpdateMetadata` directly; do not introduce a second remote-JSON parser.
- Keep metadata URL, signature, expected size and SHA-256 provisional. Transport admission does not authenticate them.
- `distribution-runtime`, as the remote updater-metadata owner, requires **every supported platform signature** to be canonical RFC 4648 standard base64 before it can return `ProvisionalUpdateMetadata`. This validates only the Tauri outer encoding contract, not the decoded minisign structure or cryptographic signature.
- `distribution-transport` consumes that invariant and must not maintain a second signature-envelope parser or a target-only structural rule.
- Publication uses the same outer contract: exact receipt-bound `.sig` bytes must be canonical standard base64 and decode to UTF-8 before entering static updater JSON.
- Do not add a base64 dependency merely to express deterministic metadata syntax; the Rust metadata-owner check is dependency-free and publication uses Python's standard library.
- Disable automatic redirect semantics in the eventual network adapter and make every followed location an explicit policy result.
- Admit a direct `200` only when the HTTP client's reported effective URL equals the exact canonical BandScope release URL already admitted by `distribution-runtime`.
- Admit at most one `302` hop, currently to the exact `https://release-assets.githubusercontent.com/` origin. A GitHub CDN host change must fail closed until the allowlist is deliberately revised; this hostname is an operational BandScope egress decision, not a claim that GitHub documents it as a permanent API guarantee.
- A redirect token is valid only for the same provisional transport identity that created it: initial URL, declared size, SHA-256 and updater signature must still match before the redirected response can be admitted.
- A second redirect is rejected. A redirected `200` must report the exact admitted redirect URL as its effective URL.
- Reject any response `Content-Encoding` other than the explicit identity coding before staging-file creation. An omitted `Content-Encoding` remains admissible. The eventual HTTP adapter must also disable automatic decompression so the header evidence and delivered byte stream cannot diverge.
- Response bodies reach disk only through `distribution-download`, preserving its expected-size, optional `Content-Length`, per-chunk, cumulative-overrun, poison and cleanup contracts.
- Content-encoding and content-length mismatch are evaluated before staging-file creation.
- A successfully staged artifact remains unverified and cleanup-on-drop. This layer performs no signature/digest trust promotion.

## Alternatives considered

Implicit HTTP-client redirects were rejected because they conceal effective-origin changes from the product's Distribution policy. Rejecting all redirects was rejected because GitHub release-asset downloads may legitimately return `302`. Re-parsing `Update.raw_json` inside the HTTP adapter was rejected because it would create a second, potentially looser interpretation of untrusted metadata. Adding `reqwest` to the deterministic policy crate was rejected for this slice because response-state admission and staging composition can be tested without expanding the direct dependency surface; the eventual production adapter must undergo the repository's normal dependency admission if a new direct client is required.

Allowing a redirect token to be identified only by its source and destination URLs was rejected because the URL can remain stable while provisional size, digest, or signature evidence changes between metadata fetches. Using a random nonce would also reject cross-attempt mixing, but would introduce nondeterminism without adding useful semantics. The selected binding carries only the already-bounded provisional transport identity needed to prove that the redirect belongs to the same policy; ordinary `Debug` output still does not expose the signature or opaque CDN query.

Allowing HTTP content codings and trusting the client to produce equivalent bytes was rejected because automatic decompression is library/configuration dependent and breaks the simple invariant that the bytes counted, hashed and signature-verified are the exact release artifact bytes. The updater path does not need content coding, so fail-closed identity/no-encoding semantics are narrower and auditable.

Deferring all signature syntax checking to Tauri's post-download verifier was rejected because an obviously malformed outer base64 envelope can be rejected without claiming cryptographic trust and without downloading a potentially large updater artifact. Validating only the selected target inside `distribution-transport` was also rejected: it duplicated metadata syntax outside the metadata owner and allowed a four-target manifest to be structurally valid on one platform while carrying an impossible Tauri envelope for another. Reimplementing minisign verification was rejected as well; Tauri remains the signature-verification owner, while BandScope only mirrors the documented outer transport envelope needed for deterministic admission.

## Selected design

`apps/desktop/distribution-runtime` owns the exact updater document schema. During the single strict parse it validates all four platform entries, including canonical standard-base64 signature envelopes with valid padding placement and zero pad bits. Only then can it return `ProvisionalUpdateMetadata` for the selected target. The result remains unauthenticated remote metadata.

`apps/desktop/distribution-transport` is a small Rust owner between that metadata boundary and `distribution-download`. `ReleaseTransportPolicy::from_provisional` copies only the already-selected target projection: canonical initial URL, safe artifact basename, declared byte size, SHA-256 and Tauri signature. It does not revalidate the signature envelope because `ProvisionalUpdateMetadata` cannot exist unless the metadata owner has already validated every supported platform envelope. `admit_initial_response` accepts exact-URL `200`, or returns an explicit one-hop redirect decision for an admitted GitHub release-asset CDN location. The redirect value privately retains the originating policy's provisional size, digest and updater signature in addition to the source/location URLs. `admit_redirect_response` first requires those values to match the current policy, then requires the second request to terminate in `200` at the exact admitted location. `AdmittedDownloadHead::start_staging` rejects non-identity `Content-Encoding`, then creates `ArtifactDownloadAdmission` before it creates a staging file, and `TransportDownload` routes chunks and exact completion into the existing sealed-descriptor lifecycle.

`scripts/release/build_updater_manifest.py` performs the publication-side companion check after the exact `.sig` size/SHA-256 receipt binding: ASCII/canonical standard-base64 validation, exact decode/re-encode equivalence and UTF-8 validation of the decoded outer payload. It still does not claim the fixture or publication script itself performs minisign verification; actual Tauri signing/verifying authority remains separate.

The transport API intentionally contains no socket/client, JSON parser, installer, freshness-state repository or project-persistence dependency. It also contains no verified-artifact type: base64 syntax plus size/status/origin/framing evidence is not cryptographic authenticity.

## RED → repair evidence

- `8f39dfc57026a25389f985e06dacee025818c5b2` added hostile/product transport cases requiring one GitHub release redirect, arbitrary-host rejection, redirect-chain rejection, effective-URL binding, content-length-before-file admission and cancel cleanup.
- `1b4f7a0a840d917f54fdb6b78ec861ba4b5ba0f7` placed the new crate in the root Python-owned native-suite gate so the locked `cargo test --all-targets` contract is part of ordinary CI.
- At that RED generation the transport source deliberately did not connect `302` to the CDN validator and returned `RedirectUnsupported`; the locked crate was therefore non-green until the causal response-state transition was implemented. The unconnected private validator was also dead code under `warnings = "deny"`; both failures had the same cause: redirect admission was not wired.
- `4964c3cd1472ed6ac9c7a9223d3da533e1af6096` connected the validator to one-hop `302` admission, preserved exact effective-URL checks, rejected redirect chaining, and routed the admitted final response into the existing bounded staging boundary.
- `8313e9fb2fe66711e2c3e0432413a94355fdf6e7` added the original selected-target RED proving that syntactically admitted `not-base64!` metadata must not reach network response admission. `6e5e42f2a20001009330c438178afa1ca811ab51` added the first dependency-free canonical-base64 envelope guard at the transport boundary.
- `03c1314884a4044129ead75db59d341b80ed4499` added publication RED for receipt-consistent but non-base64 `.sig` bytes while converting ordinary fixtures to realistic base64 envelopes. `2c7c772abcceff96dafceaaaa3b6a4e2af5f8cbc` added the publication-side canonical base64/decoded-UTF-8 gate.
- `e37632589960cd3571c99eafafdcf205734bb21b` changed the transport contract first: all staging calls now supply response content-coding evidence, encoded bodies such as `gzip` must fail before a file exists, and explicit `identity` remains admissible. `606095ec6f2ae9b5d22a777f70806dc79baa8f36` is the causal response-framing repair.
- `8d56ab1015077e256e560deba9611979cb81ec5d` added a cross-target RED: a valid Windows x86_64 signature with malformed Windows ARM signature had to fail at `distribution-runtime`, but the predecessor accepted it because only emptiness/size/NUL were checked there and the selected-target transport guard could not see the other platform entry.
- `4e28d0cf5edfb399e3ced07b12daf5c4a7aace62` made canonical standard-base64 admission part of the metadata owner's validation for every supported target and converted runtime fixtures to realistic envelopes.
- `9b691d7f1e67dff23b26b1427a8c7bf63b6fd025` removed the duplicate selected-target base64 parser and error from `distribution-transport`; `5b85e03fde690240df62ac18c4e49b9052047f83` updated the transport contract test to assert rejection at the metadata owner instead.
- `26ff403041958c433239a2359e6cfc32a2b633b9` repaired the remaining `provisional_artifact` integration fixture that still used hyphenated non-base64 placeholder signatures after the metadata-owner rule changed. Without this repair the current strict admission test could not reach the transport-field assertions it was intended to exercise.
- `11a5a47784a405e5cad973d3c40aa8fe18b40940` added the redirect-policy RED: a redirect admitted under one provisional signature must not be consumable by a second policy with the same initial URL but a different signature. The predecessor had no policy-identity mismatch state and accepted the cross-policy redirect.
- `35b851e4724ca625351a14df80f78e121a4f3d6a` is the causal repair: `AdmittedRedirect` now privately retains the originating size/digest/signature and `admit_redirect_response` rejects any cross-policy token before effective-URL/status admission.

Hosted exact-head checks remain authoritative for compilation and cross-platform evidence; predecessor results do not transfer after a head change.

## Security Notes

Untrusted inputs are the entire four-target provisional metadata document, signature envelopes, HTTP status, HTTP client's effective URL, redirect `Location`, `Content-Encoding`, `Content-Length` and response chunks. The metadata owner now applies canonical outer-base64 admission consistently to all supported target signatures before any `ProvisionalUpdateMetadata` can exist. The transport policy uses exact URL equality before body admission, a bounded redirect string, HTTPS exact-origin pinning for the admitted CDN hop, a redirect token bound to the same provisional artifact size/digest/signature that created it, one-hop redirect depth, fail-closed response-content-coding admission, and existing bounded chunk/file admission. No network, credential, subprocess, generic filesystem, installer, project or freshness-state capability is added by this ownership repair. Cancel/error cleanup continues to be owned by `distribution-download`.

This boundary does not authenticate remote metadata, does not parse or cryptographically verify the decoded minisign signature, does not hash the sealed descriptor, does not itself disable an HTTP client's automatic decompression, and does not prove packaged Windows/macOS networking behavior. Those claims remain release gates.

## References

GitHub. (2026). *REST API endpoints for release assets*. GitHub Docs. https://docs.github.com/en/rest/releases/assets

Tauri Programme. (2026). *Updater plugin*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Programme. (2026). `plugins/updater/src/updater.rs`. *tauri-apps/plugins-workspace*. https://github.com/tauri-apps/plugins-workspace/blob/0850317b5c85092cbf4ea9caf4ef3a9c771fcf27/plugins/updater/src/updater.rs

Tauri Programme. (2026). `crates/tauri-cli/src/helpers/updater_signature.rs`. *tauri-apps/tauri*. https://github.com/tauri-apps/tauri/blob/e2c54be1055851686b1b57b69cfa7d6b5a0f552f/crates/tauri-cli/src/helpers/updater_signature.rs
