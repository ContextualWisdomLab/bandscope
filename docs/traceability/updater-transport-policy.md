# Updater transport admission traceability

Status: implemented policy boundary; production network adapter still pending.

## Problem

BandScope already has a strict provisional updater-metadata parser and a bounded streaming/staging primitive, but those two boundaries were not connected by an executable transport policy. A future HTTP adapter could therefore reparse `raw_json`, allow the HTTP library to follow redirects implicitly, or hand response bytes to staging without proving which effective URL produced them.

GitHub's REST release-asset contract requires clients requesting binary asset content to handle either a direct `200` response or a `302` redirect. That makes "disable every redirect" incompatible with the supported release path, while unconstrained automatic redirects would make the final network destination an HTTP-library decision rather than a Distribution decision.

## Constraints

- Consume `ProvisionalUpdateMetadata` directly; do not introduce a second remote-JSON parser.
- Keep metadata URL, signature, expected size and SHA-256 provisional. Transport admission does not authenticate them.
- Do not add an HTTP client dependency merely to express deterministic policy.
- Disable automatic redirect semantics in the eventual network adapter and make every followed location an explicit policy result.
- Admit a direct `200` only when the HTTP client's reported effective URL equals the exact canonical BandScope release URL already admitted by `distribution-runtime`.
- Admit at most one `302` hop, currently to the exact `https://release-assets.githubusercontent.com/` origin. A GitHub CDN host change must fail closed until the allowlist is deliberately revised; this hostname is an operational BandScope egress decision, not a claim that GitHub documents it as a permanent API guarantee.
- A second redirect is rejected. A redirected `200` must report the exact admitted redirect URL as its effective URL.
- Response bodies reach disk only through `distribution-download`, preserving its expected-size, optional `Content-Length`, per-chunk, cumulative-overrun, poison and cleanup contracts.
- Content-length mismatch is evaluated before staging-file creation.
- A successfully staged artifact remains unverified and cleanup-on-drop. This layer performs no signature/digest trust promotion.

## Alternatives considered

Implicit HTTP-client redirects were rejected because they conceal effective-origin changes from the product's Distribution policy. Rejecting all redirects was rejected because GitHub release-asset downloads may legitimately return `302`. Re-parsing `Update.raw_json` inside the HTTP adapter was rejected because it would create a second, potentially looser interpretation of untrusted metadata. Adding `reqwest` to this small policy crate was rejected for this slice because response-state admission and staging composition can be tested without expanding the direct dependency surface; the eventual production adapter must undergo the repository's normal dependency admission if a new direct client is required.

## Selected design

`apps/desktop/distribution-transport` is a small Rust owner between `distribution-runtime` and `distribution-download`.

`ReleaseTransportPolicy::from_provisional` copies only the already-selected target projection: canonical initial URL, safe artifact basename, declared byte size, SHA-256 and Tauri signature. `admit_initial_response` accepts exact-URL `200`, or returns an explicit one-hop redirect decision for an admitted GitHub release-asset CDN location. `admit_redirect_response` requires that the second request terminate in `200` at that exact location. `AdmittedDownloadHead::start_staging` creates `ArtifactDownloadAdmission` before it creates a staging file, and `TransportDownload` routes chunks and exact completion into the existing sealed-descriptor lifecycle.

The API intentionally contains no socket/client, JSON parser, installer, freshness-state repository or project-persistence dependency. It also contains no verified-artifact type: size/status/origin evidence is not cryptographic authenticity.

## RED → repair evidence

- `8f39dfc57026a25389f985e06dacee025818c5b2` added hostile/product transport cases requiring one GitHub release redirect, arbitrary-host rejection, redirect-chain rejection, effective-URL binding, content-length-before-file admission and cancel cleanup.
- `1b4f7a0a840d917f54fdb6b78ec861ba4b5ba0f7` placed the new crate in the root Python-owned native-suite gate so the locked `cargo test --all-targets` contract is part of ordinary CI.
- At that RED generation the transport source deliberately did not connect `302` to the CDN validator and returned `RedirectUnsupported`; the locked crate was therefore non-green until the causal response-state transition was implemented. The unconnected private validator was also dead code under `warnings = "deny"`; both failures had the same cause: redirect admission was not wired.
- `4964c3cd1472ed6ac9c7a9223d3da533e1af6096` connected the validator to one-hop `302` admission, preserved exact effective-URL checks, rejected redirect chaining, and routed the admitted final response into the existing bounded staging boundary.

Hosted exact-head checks remain authoritative for compilation and cross-platform evidence; predecessor results do not transfer after a head change.

## Security Notes

Untrusted inputs are the provisional metadata projection, HTTP status, HTTP client's effective URL, redirect `Location`, `Content-Length` and response chunks. The policy uses exact URL equality before body admission, a bounded redirect string, HTTPS exact-origin pinning for the admitted CDN hop, one-hop redirect depth, and existing bounded chunk/file admission. No network, credential, subprocess, generic filesystem, installer, project or freshness-state capability is added here. Cancel/error cleanup continues to be owned by `distribution-download`.

This boundary does not authenticate remote metadata, does not validate the Tauri signature, does not hash the sealed descriptor, and does not prove packaged Windows/macOS networking behavior. Those claims remain release gates.

## References

GitHub. (2026). *REST API endpoints for release assets*. GitHub Docs. https://docs.github.com/en/rest/releases/assets

Tauri Programme. (2026). *Updater plugin*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Programme. (2026). `plugins/updater/src/updater.rs`. *tauri-apps/plugins-workspace*. https://github.com/tauri-apps/plugins-workspace/blob/0850317b5c85092cbf4ea9caf4ef3a9c771fcf27/plugins/updater/src/updater.rs
