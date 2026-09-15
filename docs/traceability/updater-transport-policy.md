# Updater transport admission traceability

Status: implemented policy boundary; production network adapter still pending.

## Problem

BandScope already has a strict provisional updater-metadata parser and a bounded streaming/staging primitive, but those two boundaries were not connected by an executable transport policy. A future HTTP adapter could therefore reparse `raw_json`, allow the HTTP library to follow redirects implicitly, hand transformed response bytes to staging, or fail to prove which effective URL produced them.

GitHub's REST release-asset contract requires clients requesting binary asset content to handle either a direct `200` response or a `302` redirect. That makes "disable every redirect" incompatible with the supported release path, while unconstrained automatic redirects would make the final network destination an HTTP-library decision rather than a Distribution decision.

Tauri's updater CLI writes the textual minisign signature box as standard-base64 text into the `.sig` artifact, and the updater runtime first base64-decodes the manifest `signature` back to UTF-8 before parsing/verifying the signature box. Merely bounding a remote signature string therefore leaves malformed envelopes to fail only after network/download work unless BandScope rejects them earlier.

Updater signatures and SHA-256 evidence are defined over the exact published artifact bytes. HTTP content codings such as gzip or brotli can make an HTTP stack expose decoded bytes that differ from the wire representation while `Content-Length` still describes the encoded body. Distribution must therefore reject transformed response bodies before filesystem mutation rather than depend on client-specific automatic decompression behavior.

## Constraints

- Consume `ProvisionalUpdateMetadata` directly; do not introduce a second remote-JSON parser.
- Keep metadata URL, signature, expected size and SHA-256 provisional. Transport admission does not authenticate them.
- Require the selected Tauri signature to be canonical RFC 4648 standard base64 before any network request. This validates only the outer encoding contract, not the decoded minisign structure or cryptographic signature.
- Publication uses the same outer contract: exact receipt-bound `.sig` bytes must be canonical standard base64 and decode to UTF-8 before entering static updater JSON.
- Do not add an HTTP client or base64 dependency merely to express deterministic policy; the Rust envelope check is dependency-free and publication uses Python's standard library.
- Disable automatic redirect semantics in the eventual network adapter and make every followed location an explicit policy result.
- Admit a direct `200` only when the HTTP client's reported effective URL equals the exact canonical BandScope release URL already admitted by `distribution-runtime`.
- Admit at most one `302` hop, currently to the exact `https://release-assets.githubusercontent.com/` origin. A GitHub CDN host change must fail closed until the allowlist is deliberately revised; this hostname is an operational BandScope egress decision, not a claim that GitHub documents it as a permanent API guarantee.
- A second redirect is rejected. A redirected `200` must report the exact admitted redirect URL as its effective URL.
- Reject any response `Content-Encoding` other than the explicit identity coding before staging-file creation. An omitted `Content-Encoding` remains admissible. The eventual HTTP adapter must also disable automatic decompression so the header evidence and delivered byte stream cannot diverge.
- Response bodies reach disk only through `distribution-download`, preserving its expected-size, optional `Content-Length`, per-chunk, cumulative-overrun, poison and cleanup contracts.
- Content-encoding and content-length mismatch are evaluated before staging-file creation.
- A successfully staged artifact remains unverified and cleanup-on-drop. This layer performs no signature/digest trust promotion.

## Alternatives considered

Implicit HTTP-client redirects were rejected because they conceal effective-origin changes from the product's Distribution policy. Rejecting all redirects was rejected because GitHub release-asset downloads may legitimately return `302`. Re-parsing `Update.raw_json` inside the HTTP adapter was rejected because it would create a second, potentially looser interpretation of untrusted metadata. Adding `reqwest` to this small policy crate was rejected for this slice because response-state admission and staging composition can be tested without expanding the direct dependency surface; the eventual production adapter must undergo the repository's normal dependency admission if a new direct client is required.

Allowing HTTP content codings and trusting the client to produce equivalent bytes was rejected because automatic decompression is library/configuration dependent and breaks the simple invariant that the bytes counted, hashed and signature-verified are the exact release artifact bytes. The updater path does not need content coding, so fail-closed identity/no-encoding semantics are narrower and auditable.

Deferring all signature syntax checking to Tauri's post-download verifier was rejected because an obviously malformed outer base64 envelope can be rejected without claiming cryptographic trust and without downloading a potentially large updater artifact. Reimplementing minisign verification was also rejected: Tauri remains the signature-verification owner, and BandScope only mirrors the documented outer transport envelope needed to fail earlier.

## Selected design

`apps/desktop/distribution-transport` is a small Rust owner between `distribution-runtime` and `distribution-download`.

`ReleaseTransportPolicy::from_provisional` copies only the already-selected target projection: canonical initial URL, safe artifact basename, declared byte size, SHA-256 and Tauri signature. Before response admission it validates that signature as canonical standard base64, including padding placement and zero pad bits. `admit_initial_response` accepts exact-URL `200`, or returns an explicit one-hop redirect decision for an admitted GitHub release-asset CDN location. `admit_redirect_response` requires that the second request terminate in `200` at that exact location. `AdmittedDownloadHead::start_staging` rejects non-identity `Content-Encoding`, then creates `ArtifactDownloadAdmission` before it creates a staging file, and `TransportDownload` routes chunks and exact completion into the existing sealed-descriptor lifecycle.

`scripts/release/build_updater_manifest.py` performs the publication-side companion check after the exact `.sig` size/SHA-256 receipt binding: ASCII/canonical standard-base64 validation, exact decode/re-encode equivalence and UTF-8 validation of the decoded outer payload. It still does not claim the fixture or publication script itself performs minisign verification; actual Tauri signing/verifying authority remains separate.

The transport API intentionally contains no socket/client, JSON parser, installer, freshness-state repository or project-persistence dependency. It also contains no verified-artifact type: base64 syntax plus size/status/origin/framing evidence is not cryptographic authenticity.

## RED → repair evidence

- `8f39dfc57026a25389f985e06dacee025818c5b2` added hostile/product transport cases requiring one GitHub release redirect, arbitrary-host rejection, redirect-chain rejection, effective-URL binding, content-length-before-file admission and cancel cleanup.
- `1b4f7a0a840d917f54fdb6b78ec861ba4b5ba0f7` placed the new crate in the root Python-owned native-suite gate so the locked `cargo test --all-targets` contract is part of ordinary CI.
- At that RED generation the transport source deliberately did not connect `302` to the CDN validator and returned `RedirectUnsupported`; the locked crate was therefore non-green until the causal response-state transition was implemented. The unconnected private validator was also dead code under `warnings = "deny"`; both failures had the same cause: redirect admission was not wired.
- `4964c3cd1472ed6ac9c7a9223d3da533e1af6096` connected the validator to one-hop `302` admission, preserved exact effective-URL checks, rejected redirect chaining, and routed the admitted final response into the existing bounded staging boundary.
- `8313e9fb2fe66711e2c3e0432413a94355fdf6e7` added a clean transport RED proving that syntactically admitted `not-base64!` metadata must not reach network response admission. `6e5e42f2a20001009330c438178afa1ca811ab51` added the dependency-free canonical-base64 envelope guard.
- `03c1314884a4044129ead75db59d341b80ed4499` added publication RED for receipt-consistent but non-base64 `.sig` bytes while converting ordinary fixtures to realistic base64 envelopes. `2c7c772abcceff96dafceaaaa3b6a4e2af5f8cbc` added the publication-side canonical base64/decoded-UTF-8 gate.
- `e37632589960cd3571c99eafafdcf205734bb21b` changed the transport contract first: all staging calls now supply response content-coding evidence, encoded bodies such as `gzip` must fail before a file exists, and explicit `identity` remains admissible. That head is RED against the predecessor implementation because the required third argument and error variant do not exist yet.
- `606095ec6f2ae9b5d22a777f70806dc79baa8f36` is the causal repair: `AdmittedDownloadHead::start_staging` now rejects every supplied content coding except case-insensitive `identity` before byte-count admission or filesystem mutation.

Hosted exact-head checks remain authoritative for compilation and cross-platform evidence; predecessor results do not transfer after a head change.

## Security Notes

Untrusted inputs are the provisional metadata projection, signature envelope, HTTP status, HTTP client's effective URL, redirect `Location`, `Content-Encoding`, `Content-Length` and response chunks. The policy uses canonical outer-base64 admission before network work, exact URL equality before body admission, a bounded redirect string, HTTPS exact-origin pinning for the admitted CDN hop, one-hop redirect depth, fail-closed response-content-coding admission, and existing bounded chunk/file admission. No network, credential, subprocess, generic filesystem, installer, project or freshness-state capability is added here. Cancel/error cleanup continues to be owned by `distribution-download`.

This boundary does not authenticate remote metadata, does not parse or cryptographically verify the decoded minisign signature, does not hash the sealed descriptor, does not itself disable an HTTP client's automatic decompression, and does not prove packaged Windows/macOS networking behavior. Those claims remain release gates.

## References

GitHub. (2026). *REST API endpoints for release assets*. GitHub Docs. https://docs.github.com/en/rest/releases/assets

Tauri Programme. (2026). *Updater plugin*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Programme. (2026). `plugins/updater/src/updater.rs`. *tauri-apps/plugins-workspace*. https://github.com/tauri-apps/plugins-workspace/blob/0850317b5c85092cbf4ea9caf4ef3a9c771fcf27/plugins/updater/src/updater.rs

Tauri Programme. (2026). `crates/tauri-cli/src/helpers/updater_signature.rs`. *tauri-apps/tauri*. https://github.com/tauri-apps/tauri/blob/e2c54be1055851686b1b57b69cfa7d6b5a0f552f/crates/tauri-cli/src/helpers/updater_signature.rs
