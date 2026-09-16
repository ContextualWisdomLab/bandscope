# Updater release admission traceability

## Decision

BandScope treats desktop update authority as a Distribution/update release input, not as an incidental Tauri setting. `release/updater-policy.json` is the repository-owned admission record. The protected release preflight consumes it through `scripts/checks/verify_release_updater_policy.py`.

The current policy is deliberately `blocked`. BandScope does not yet have an organization-approved updater signing public key and immutable production HTTPS endpoint. A version tag therefore cannot become a commercial release merely because ordinary desktop packaging succeeds.

## Problem

Tauri v2 requires update artifacts to be signed and verifies them with a public key embedded in updater configuration. The updater signature check cannot be disabled. Tauri also requires `bundle.createUpdaterArtifacts` to generate update bundles/signatures and requires production endpoints to use TLS unless an explicitly dangerous insecure-transport option is enabled. Its updater setup additionally requires the `tauri-plugin-updater` Rust dependency and runtime plugin initialization.

The first updater-admission slice closed configuration-only authority drift, but fresh review found a second executable gap: a future policy could be `admitted`, `tauri.conf.json` could contain the correct public key/endpoints and updater-artifact setting, yet the shipped desktop binary could omit `tauri-plugin-updater` or never initialize it. The preflight would then report commercial updater admission for a build with no compiled updater runtime.

After that repair, the release artifact graph still had a third gap. Tauri v2 emits Windows installer `.sig` files and a macOS `.app.tar.gz` updater bundle plus `.sig`, but BandScope's release packager copied only standard DMG/EXE/MSI outputs. Source/config/runtime admission therefore did not prove that the exact generated updater payload/signature bytes were carried into the release candidate and bound to its receipt.

These are Distribution release-truth defects, not UI or Active Player concerns. Distribution must bind authority, compiled runtime, generated updater payload/signature bytes, and eventual manifest/publication evidence without moving secret signing authority into source.

## Constraints

- Private updater signing keys never belong in repository files, build artifacts, logs, or policy JSON.
- A public verification key is safe to distribute, but the organization-approved key value is still release authority and must not be invented by an automation writer.
- Production updater endpoints must be exact policy inputs; a generic arbitrary-URL updater would violate the local-first and narrow-capability boundary.
- Ordinary startup and local rehearsal analysis must remain usable while the updater service is unavailable.
- Distribution owns update publication and trust. Active Player, Project Persistence, Signal/MIR, and Resource Admission do not receive duplicate updater authority.
- Mutable Git/path updater dependencies are not commercial admission evidence. The release gate requires a versioned dependency and an immutable registry lock entry with checksum.
- Presence of `.sig` bytes is release evidence, not by itself proof that the signature verifies against the approved public key.

## Implemented contract

`verify_release_updater_policy.py` reads only fixed repository-relative policy, Tauri configuration, desktop Cargo manifest/lock, and desktop runtime source paths. Inputs are bounded regular non-link files read from stable descriptors; JSON duplicate members are rejected.

For `state=blocked`, the guard requires:

- `publicKey` is `null`;
- `endpoints` is empty;
- a non-empty reason is recorded;
- Tauri updater artifact generation is absent/disabled;
- Tauri updater plugin configuration is absent;
- tag/release callers using `require_admitted=True` fail closed.

The current blocked repository does not need to install an updater dependency merely to prove that updates are disabled.

For a future `state=admitted`, the guard requires:

- one bounded literal public verification key;
- one to four unique HTTPS endpoints without userinfo or fragments;
- exact key/endpoint equality between policy and Tauri configuration;
- `bundle.createUpdaterArtifacts=true`;
- `dangerousInsecureTransportProtocol` is not enabled;
- a valid SemVer `minimumSupportedVersion` and an explicit stable/beta channel;
- exactly one `tauri-plugin-updater` dependency declaration in the desktop root or target-specific Cargo dependency tables;
- a versioned, non-optional updater dependency with no mutable `path` or `git` source;
- exactly one `tauri-plugin-updater` package in `Cargo.lock`, from a registry source with a full registry checksum;
- an executable desktop source initializer matching `.plugin(tauri_plugin_updater::Builder::new().build())` after comments and string literals are blanked so documentation/example text cannot satisfy release admission.

`verify_release_identity.py` composes this guard with the existing version and commercial-model admission guards. `package_desktop_artifact.py` invokes that release preflight before creating `artifacts/` for version tags, so updater admission is on the same fail-closed path as tag packaging rather than a detached audit.

For an admitted tag path, `package_desktop_artifact.py` now also requires the generated Tauri v2 updater outputs:

- Windows: every packaged NSIS/MSI installer must have its adjacent `<installer>.sig`; the copied standard installer must remain byte-identical to the Tauri updater bundle it represents.
- macOS: exactly one target-local `*.app.tar.gz` updater bundle and adjacent `.sig` must exist in Tauri's macOS bundle directory.
- `.sig` evidence must be regular, non-link, non-empty and no larger than 64 KiB.
- source and copied updater bytes are compared by exact size/full SHA-256.
- `release-receipt.json` re-admits those copied bytes immediately before publication and records bundle/signature names, sizes and full SHA-256 values under `updaterArtifacts`.

This is artifact identity binding. It deliberately does not perform private-key operations or promote `.sig` presence into a cryptographic-validity claim.

### RED → repair lineage

Runtime-wiring slice:

- `8843a308303d7731a175abfc0b90fb365cb7518e` adds the realistic RED: configuration-only admission must fail when the updater crate or runtime initializer is absent.
- `9869d32bdad9787f3af6556f73d74070f8541b5f` binds admitted policy to bounded Cargo manifest/lock evidence and the desktop runtime initializer.
- `6d91f7c7bc117da9ece7563e45a7d88de09b09d4` updates the existing admitted-policy fixtures so configuration tests exercise a genuinely wired updater graph rather than an impossible config-only state.

Generated-artifact slice:

- `421aaeec44fcb93f0250f44487d56a7b711aede0` adds RED coverage for missing Windows `.sig`, missing macOS `.app.tar.gz`/`.sig`, exact receipt binding and post-copy signature drift.
- `0e012723e2bff7068d162b721a29d3141c036175` packages the platform-correct Tauri v2 updater bundle/signature evidence and binds exact copied bytes to the release receipt.
- `0fa723801b72c57a0bee8cc706581b0e2b3129d2` updates the release-receipt traceability with the platform artifact semantics and claim limits.

## Alternatives rejected

### Check only whether a public key string exists

Rejected. A key without exact endpoint/config projection still allows authority drift, and a string-presence check does not prove updater artifacts are generated.

### Treat `tauri.conf.json` as proof that the updater exists in the binary

Rejected. Configuration can describe a plugin that Cargo does not compile or the application never initializes. Commercial admission has to agree across policy, Tauri config, Cargo manifest/lock, and runtime construction.

### Accept a Cargo dependency without checking the runtime initializer

Rejected. A locked crate can remain unused. Dependency presence is supply-chain evidence, not evidence that the desktop runtime actually installs the updater plugin.

### Treat `createUpdaterArtifacts=true` as proof that updater bytes are in the release

Rejected. Configuration expresses intent. The release candidate must contain the platform-specific generated updater bundle/signature bytes and bind their exact identity to the release receipt.

### Treat macOS DMG as the updater payload

Rejected. Tauri v2 generates a separate `.app.tar.gz` update bundle on macOS. The DMG remains the notarized installer evidence; the updater tarball/signature is a distinct release artifact.

### Enable Tauri updater with placeholder key or endpoint

Rejected. Placeholder release authority is materially worse than an explicit blocked state because it can be mistaken for production readiness or accidentally shipped.

### Put the private signing key in policy

Rejected. Tauri's private signing key is secret release authority. Repository policy may bind the public verification key only; private-key custody belongs to the external signing/secret-management boundary.

## Claim boundary

Current source-level admission proves that BandScope cannot label a version-tag build commercially updater-ready while updater authority is absent, admitted Tauri configuration drifts, the updater crate is missing from the immutable Cargo graph, or the desktop runtime omits the updater plugin initializer. The package path also fails closed when the expected platform-specific updater bundle/signature evidence is absent or drifts before the release receipt is published.

It does **not** yet prove:

- that an approved signing key has been provisioned;
- that a production updater endpoint has been provisioned and is operational;
- that copied `.sig` bytes cryptographically verify against the approved release public key;
- that a static/dynamic updater manifest is generated from and immutably bound to the exact `updaterArtifacts` receipt entries;
- that the runtime successfully checks, downloads, verifies, installs, restarts, and recovers on packaged Windows/macOS builds;
- that wrong-key/wrong-signature, digest mismatch, truncated/replayed/stale metadata, partial download, disk-full, cancellation, first-launch failure, staged rollout, deferral, retry, offline operation, or rollback behavior has passed acceptance;
- that project-schema compatibility permits a given rollback;
- that lexical source wiring evidence alone establishes behavioral updater correctness. Hosted compilation and packaged runtime acceptance remain separate gates.

Those remain repository-owned work under #960 once external updater key/endpoint authority is available, except for signer/key ownership itself.

## Test evidence

`services/analysis-engine/tests/test_release_updater_policy.py` covers checked-in blocked authority, tag-preflight composition, exact admitted key/HTTPS endpoint projection, endpoint drift/insecure transport, missing updater artifact generation, partially enabled blocked state, duplicate JSON members, and an admitted config projected through a valid locked updater/runtime fixture.

`services/analysis-engine/tests/test_release_updater_runtime_wiring.py` covers missing compiled dependency, locked dependency without runtime initializer, and the positive immutable dependency/runtime wiring contract.

`services/analysis-engine/tests/test_release_updater_artifact_binding.py` covers missing Windows signature, missing macOS updater bundle/signature, platform-correct copy/binding, post-copy drift rejection, and non-tag independence.

Hosted current-head CI remains authoritative for merge/release status. No predecessor-head GREEN or review transfers after these source commits.

## References

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Semantic Versioning. (n.d.). *Semantic Versioning 2.0.0*. https://semver.org/spec/v2.0.0.html
