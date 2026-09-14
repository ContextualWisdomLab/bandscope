# Updater release admission traceability

## Decision

BandScope treats desktop update authority as a Distribution/update release input, not as an incidental Tauri setting. `release/updater-policy.json` is the repository-owned admission record. The protected release preflight consumes it through `scripts/checks/verify_release_updater_policy.py`.

The current policy is deliberately `blocked`. BandScope does not yet have an organization-approved updater signing public key and immutable production HTTPS endpoint. A version tag therefore cannot become a commercial release merely because ordinary desktop packaging succeeds.

## Problem

Tauri v2 requires update artifacts to be signed and verifies them with a public key embedded in updater configuration. The updater signature check cannot be disabled. Tauri also requires `bundle.createUpdaterArtifacts` to generate update bundles/signatures and requires production endpoints to use TLS unless an explicitly dangerous insecure-transport option is enabled. Its updater setup additionally requires the `tauri-plugin-updater` Rust dependency and runtime plugin initialization.

The first updater-admission slice closed configuration-only authority drift, but fresh review found a second executable gap: a future policy could be `admitted`, `tauri.conf.json` could contain the correct public key/endpoints and updater-artifact setting, yet the shipped desktop binary could omit `tauri-plugin-updater` or never initialize it. The preflight would then report commercial updater admission for a build with no compiled updater runtime.

That is a release-truth defect, not a UI or Active Player concern. Distribution must bind admission to the application dependency/runtime graph before a tag is allowed to proceed.

## Constraints

- Private updater signing keys never belong in repository files, build artifacts, logs, or policy JSON.
- A public verification key is safe to distribute, but the organization-approved key value is still release authority and must not be invented by an automation writer.
- Production updater endpoints must be exact policy inputs; a generic arbitrary-URL updater would violate the local-first and narrow-capability boundary.
- Ordinary startup and local rehearsal analysis must remain usable while the updater service is unavailable.
- Distribution owns update publication and trust. Active Player, Project Persistence, Signal/MIR, and Resource Admission do not receive duplicate updater authority.
- Mutable Git/path updater dependencies are not commercial admission evidence. The release gate requires a versioned dependency and an immutable registry lock entry with checksum.

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

`verify_release_identity.py` composes this guard with the existing version and commercial-model admission guards. `package_desktop_artifact.py` already invokes that release preflight before creating `artifacts/` for version tags, so updater admission is on the same fail-closed path as tag packaging rather than a detached audit.

### RED → repair lineage

- `8843a308303d7731a175abfc0b90fb365cb7518e` adds the realistic RED: configuration-only admission must fail when the updater crate or runtime initializer is absent.
- `9869d32bdad9787f3af6556f73d74070f8541b5f` binds admitted policy to bounded Cargo manifest/lock evidence and the desktop runtime initializer.
- `6d91f7c7bc117da9ece7563e45a7d88de09b09d4` updates the existing admitted-policy fixtures so configuration tests exercise a genuinely wired updater graph rather than an impossible config-only state.

## Alternatives rejected

### Check only whether a public key string exists

Rejected. A key without exact endpoint/config projection still allows authority drift, and a string-presence check does not prove updater artifacts are generated.

### Treat `tauri.conf.json` as proof that the updater exists in the binary

Rejected. Configuration can describe a plugin that Cargo does not compile or the application never initializes. Commercial admission has to agree across policy, Tauri config, Cargo manifest/lock, and runtime construction.

### Accept a Cargo dependency without checking the runtime initializer

Rejected. A locked crate can remain unused. Dependency presence is supply-chain evidence, not evidence that the desktop runtime actually installs the updater plugin.

### Accept a source initializer without a locked dependency

Rejected. Source text alone does not establish the immutable package graph. The release contract requires the registry-resolved package and checksum as well.

### Enable Tauri updater with placeholder key or endpoint

Rejected. Placeholder release authority is materially worse than an explicit blocked state because it can be mistaken for production readiness or accidentally shipped.

### Allow HTTP for development and rely on environment discipline

Rejected for commercial admission. Tauri exposes `dangerousInsecureTransportProtocol`; production policy explicitly refuses that escape hatch. Development-only update experiments should remain separate from the release authority.

### Put the private signing key in policy

Rejected. Tauri's private signing key is secret release authority. Repository policy may bind the public verification key only; private-key custody belongs to the external signing/secret-management boundary.

## Claim boundary

This change proves that BandScope cannot label a version-tag build commercially updater-ready while updater authority is absent, admitted Tauri configuration drifts, the updater crate is missing from the immutable Cargo graph, or the desktop runtime omits the updater plugin initializer.

It does **not** yet prove:

- that an approved signing key has been provisioned;
- that a production updater endpoint has been provisioned and is operational;
- that `.sig` files are generated and published for every supported target;
- that a static/dynamic updater manifest is immutable and bound to exact release receipts;
- that the runtime successfully checks, downloads, verifies, installs, restarts, and recovers on packaged Windows/macOS builds;
- that wrong-key/wrong-signature, digest mismatch, truncated/replayed/stale metadata, partial download, disk-full, cancellation, first-launch failure, staged rollout, deferral, retry, offline operation, or rollback behavior has passed acceptance;
- that project-schema compatibility permits a given rollback;
- that lexical source wiring evidence alone establishes behavioral updater correctness. Hosted compilation and packaged runtime acceptance remain separate gates.

Those remain repository-owned work under #960 once external updater key/endpoint authority is available, except for signer/key ownership itself.

## Test evidence

`services/analysis-engine/tests/test_release_updater_policy.py` covers:

- current checked-in blocked authority;
- tag-preflight composition;
- exact admitted public-key and HTTPS-endpoint projection;
- endpoint drift and insecure transport;
- missing updater artifact generation;
- a blocked policy hiding partially enabled updater capability;
- duplicate-member JSON ambiguity;
- admitted configuration projected through a valid locked updater/runtime fixture.

`services/analysis-engine/tests/test_release_updater_runtime_wiring.py` covers:

- admitted config with no compiled `tauri-plugin-updater` dependency;
- a locked updater dependency with no runtime initializer;
- the positive manifest/lock/runtime wiring contract.

Hosted current-head CI remains authoritative for merge/release status. No predecessor-head GREEN or review transfers after these source commits.

## References

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Semantic Versioning. (n.d.). *Semantic Versioning 2.0.0*. https://semver.org/spec/v2.0.0.html
