# Updater transport admission traceability

Status: implemented deterministic policy boundary; production network adapter still pending.

## Problem

BandScope already has a strict provisional updater-metadata parser and a bounded streaming/staging primitive. Distribution still needs an executable boundary between those owners so a future HTTP adapter cannot reparse `raw_json`, follow redirects implicitly, transform response bytes before staging, or lose the exact response origin that produced an updater artifact.

GitHub release-asset delivery may terminate directly with `200` or use a `302` hop. Rejecting every redirect would therefore break the supported release path, while delegating redirect decisions to an HTTP client would make the final network destination library-controlled rather than Distribution-controlled.

Updater signatures and SHA-256 evidence describe exact published artifact bytes. Content codings such as gzip or brotli can make a client expose decoded bytes while response framing still describes the encoded representation. Distribution therefore rejects transformed response bodies before filesystem mutation and requires the eventual network adapter to disable transparent decoding.

A redirect decision is also attempt state, not just a destination URL. The first repair bound `AdmittedRedirect` to the initial URL plus provisional artifact size, digest and updater signature. Fresh review found that this was still narrower than the release candidate carried by `ProvisionalUpdateMetadata`: two metadata projections could reuse the same versioned artifact URL, size, digest and signature while changing `sourceCommit` or `minimumSupportedVersion`. The old redirect token would then be accepted by the second policy even though it originated from a different provisional release candidate. This does not by itself create cryptographic trust, but it breaks evidence continuity before metadata authentication and makes later sealed-descriptor promotion ambiguous.

The same continuity problem existed one transition later. `AdmittedDownloadHead` exposed the artifact URL/size/digest/signature, but did not retain the full provisional candidate identity. `TransportDownload::finish` then returned a bare `SealedArtifactFile`. A later verifier could therefore hold the correct descriptor while accidentally pairing it with source-commit, target, version, minimum-supported-version or artifact evidence retained from a different provisional candidate. The bytes remained bounded and synchronized, but the type system no longer proved which admitted candidate produced them.

## Constraints

- Consume `ProvisionalUpdateMetadata` directly; do not introduce a second remote-JSON parser.
- URL, signature, expected size, SHA-256, version, source commit and minimum-supported version remain provisional until a later authenticated metadata binding succeeds.
- `distribution-runtime` owns the four-target updater document schema and requires every supported platform signature to use the canonical RFC 4648 standard-base64 outer envelope before it can construct `ProvisionalUpdateMetadata`. This is syntax admission, not minisign verification.
- `distribution-transport` must not duplicate the signature-envelope parser or invent a second metadata interpretation.
- Disable automatic redirect semantics in the eventual network adapter. Every followed location must originate from an explicit `ResponseDecision`.
- Admit a direct `200` only when the HTTP client's effective URL exactly equals the canonical BandScope release URL already admitted by `distribution-runtime`.
- Admit at most one `302` hop, currently to `https://release-assets.githubusercontent.com/`. A CDN-host change fails closed until this BandScope egress decision is reviewed.
- A redirect token is valid only for the same provisional release candidate and artifact evidence that created it: version components, source commit, target, minimum-supported-version components, initial URL, declared size, SHA-256 and updater signature must all remain identical.
- A redirected request must terminate in `200` at the exact admitted redirect URL. Redirect chaining is rejected.
- Reject every response `Content-Encoding` other than explicit `identity` before staging-file creation. Omitted `Content-Encoding` remains admissible. The production adapter must also disable transparent decompression so header evidence and delivered bytes cannot diverge.
- Response bodies reach disk only through `distribution-download`, preserving expected-size, optional `Content-Length`, per-chunk, cumulative-overrun, poison and cleanup contracts.
- Content-encoding and content-length mismatch are evaluated before staging-file creation.
- Starting staging consumes the admitted response head. Candidate identity, effective URL, expected size, SHA-256 and updater signature remain attached to that one staging attempt and must survive sealing in the same move-only value as the exact descriptor.
- A successfully staged artifact is still unverified scratch. This owner performs no updater-signature verification, digest trust promotion, installation or highest-seen mutation.

## Alternatives considered

Implicit HTTP-client redirects were rejected because they conceal origin changes. Rejecting all redirects was rejected because GitHub release-asset delivery may legitimately use `302`. Re-parsing updater JSON in the network adapter was rejected because it would create a second, potentially looser interpretation of untrusted metadata. Adding a random per-attempt nonce was also rejected: the complete candidate and artifact identity needed to prove deterministic policy continuity is already bounded by `distribution-runtime`, so a nonce would add nondeterminism without adding release semantics.

Binding a redirect token only to source/destination URLs was rejected because metadata evidence can change while a canonical release URL remains stable. The earlier size/digest/signature binding closed one form of cross-policy replay but still omitted source commit and minimum-supported version. The selected design therefore carries the full bounded candidate identity needed by this owner, while keeping ordinary `Debug` output free of updater signatures and opaque CDN queries.

Returning a bare `SealedArtifactFile` and asking future verification code to keep a separate metadata object synchronized was rejected for the same reason. Descriptor identity is only useful if the digest/signature/candidate evidence being checked belongs to that descriptor. The selected `SealedTransportArtifact` keeps the exact sealed descriptor and its provisional transport evidence together without reopening the path or promoting trust.

Allowing HTTP content coding and trusting a client to reconstruct equivalent bytes was rejected because automatic decompression is library/configuration dependent. Reimplementing minisign verification here was also rejected: Tauri/updater verification remains the cryptographic owner, while BandScope's transport layer only admits bounded response semantics and exact bytes.

## Selected design

`apps/desktop/distribution-runtime` owns strict updater-document parsing. It validates all four platform entries, including canonical standard-base64 signature envelopes, and returns one selected `ProvisionalUpdateMetadata`. The result remains unauthenticated remote metadata.

`apps/desktop/distribution-transport` sits between that metadata owner and `distribution-download`. `ReleaseTransportPolicy::from_provisional` copies the canonical initial URL, safe artifact basename, declared byte size, SHA-256 and updater signature. It also builds a private `ProvisionalPolicyIdentity` from the already-bounded version components, source commit, target and minimum-supported-version components. No raw metadata is reparsed.

`admit_initial_response` accepts exact-URL `200`, or returns an explicit one-hop `AdmittedRedirect` for an allowed GitHub release-asset CDN location. The redirect token privately carries both the full provisional candidate identity and the artifact evidence that created it. `admit_redirect_response` first requires that complete identity to equal the current policy, then requires the response to terminate in `200` at the exact admitted location. Only after those checks can an `AdmittedDownloadHead` expose a body to bounded staging.

`AdmittedDownloadHead` now carries the same private candidate identity. `start_staging` consumes that head and moves it into `TransportDownload`, so a response head cannot be detached from or reused independently of the staging attempt it admitted. `TransportDownload::finish` returns `SealedTransportArtifact`, which owns both the exact `SealedArtifactFile` and the head evidence. Read-only access to the bytes delegates to `SealedArtifactFile::reader`, so later digest/signature verification can consume the same descriptor without reopening the staging pathname.

`distribution-download` remains the filesystem/descriptor owner. `TransportDownload` only forwards bounded chunks and completion into its existing staging/seal contract. Cancellation retains the same owner cleanup behavior; the transport crate does not reopen an artifact or create a second descriptor authority.

`scripts/release/build_updater_manifest.py` remains the publication-side companion for the outer signature-envelope contract after exact `.sig` receipt binding. It does not claim to perform minisign verification.

The transport API intentionally contains no socket/client, installer, freshness repository, project persistence dependency, or verified-artifact type. `SealedTransportArtifact` is explicitly still unverified and cleanup-on-drop. The eventual HTTP adapter must be added separately with the repository's reviewed dependency admission and exact standalone lock graph; cryptographic verification and verified-artifact promotion remain later owners.

## RED → repair evidence

- `8f39dfc57026a25389f985e06dacee025818c5b2` introduced the original hostile/product transport cases for direct download, one-hop redirect, hostile origin, redirect chaining, framing and cancellation.
- `1b4f7a0a840d917f54fdb6b78ec861ba4b5ba0f7` placed the standalone transport crate in the native CI suite; `4964c3cd1472ed6ac9c7a9223d3da533e1af6096` connected one-hop `302` admission to bounded staging.
- `8313e9fb2fe66711e2c3e0432413a94355fdf6e7` / `6e5e42f2a20001009330c438178afa1ca811ab51` established the first canonical base64 envelope contract. `03c1314884a4044129ead75db59d341b80ed4499` / `2c7c772abcceff96dafceaaaa3b6a4e2af5f8cbc` added the matching publication-side envelope gate.
- `e37632589960cd3571c99eafafdcf205734bb21b` / `606095ec6f2ae9b5d22a777f70806dc79baa8f36` established fail-closed content-coding admission before staging.
- `8d56ab1015077e256e560deba9611979cb81ec5d` / `4e28d0cf5edfb399e3ced07b12daf5c4a7aace62` moved canonical signature-envelope admission to the metadata owner for every supported target. `9b691d7f1e67dff23b26b1427a8c7bf63b6fd025` and `5b85e03fde690240df62ac18c4e49b9052047f83` then removed the duplicate transport parser and aligned the test contract; `26ff403041958c433239a2359e6cfc32a2b633b9` repaired the remaining strict-admission fixture.
- `11a5a47784a405e5cad973d3c40aa8fe18b40940` proved that a redirect created with one updater signature could cross into another policy. `35b851e4724ca625351a14df80f78e121a4f3d6a` repaired that class by binding size/digest/signature to the redirect token.
- `fd29aa1c238c4c0d0c7bec914f219b877b2e88b3` proved at source level that the same artifact URL/size/digest/signature could still let a redirect token cross to metadata with a different source commit or minimum-supported version. `6b0fe81407c6c20492dc31164124309ebc83dafa` repaired that class by carrying the private full candidate identity through redirect admission.
- `9901b2d906f6f0d418bfd4860b9e404f9da27533` adds the current source-level RED: after sealing, the returned value must still expose the exact provisional candidate identity and artifact evidence that admitted the same descriptor. The RED was committed before the causal source change; it was not separately claimed as a hosted failing run.
- `e42f6e6d8b035e6a87ee4b5eb7845874f5d76465` is the causal repair. `AdmittedDownloadHead` now owns the private candidate identity, staging consumes the head, and `TransportDownload::finish` returns a move-only `SealedTransportArtifact` that owns both evidence and descriptor.
- `3ef753fb5c6b195c75c9b483d65506256f60765d` extends the regression through the descriptor-preserving read path and verifies the exact sealed bytes without reopening the pathname.

Hosted exact-head checks remain authoritative for compilation and cross-platform evidence; predecessor results do not transfer after a head change.

## Security Notes

Untrusted inputs are the four-target provisional metadata document, signature envelopes, HTTP status, client-reported effective URL, redirect `Location`, `Content-Encoding`, `Content-Length` and response chunks. The metadata owner applies structural admission before transport policy exists. Transport then uses exact URL equality, bounded HTTPS redirect admission, one-hop depth, full provisional candidate plus artifact-evidence binding, fail-closed content-coding admission and existing bounded chunk/file admission.

The private candidate identity and `SealedTransportArtifact` are intentionally not trust promotion. A malicious or compromised metadata source can still provide a self-consistent false candidate until the later metadata-authentication owner verifies it. This boundary also does not cryptographically verify the updater signature, hash the sealed descriptor, disable decompression by itself, perform network I/O, or prove packaged Windows/macOS behavior. Those claims remain release gates.

## References

GitHub. (2026). *REST API endpoints for release assets*. GitHub Docs. https://docs.github.com/en/rest/releases/assets

Tauri Programme. (2026). *Updater plugin*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Tauri Programme. (2026). `plugins/updater/src/updater.rs`. *tauri-apps/plugins-workspace*. https://github.com/tauri-apps/plugins-workspace/blob/0850317b5c85092cbf4ea9caf4ef3a9c771fcf27/plugins/updater/src/updater.rs

Tauri Programme. (2026). `crates/tauri-cli/src/helpers/updater_signature.rs`. *tauri-apps/tauri*. https://github.com/tauri-apps/tauri/blob/e2c54be1055851686b1b57b69cfa7d6b5a0f552f/crates/tauri-cli/src/helpers/updater_signature.rs
