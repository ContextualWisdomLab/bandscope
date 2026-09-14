# Updater release admission traceability

## Decision

BandScope treats desktop update authority as a Distribution/update release input, not as an incidental Tauri setting. `release/updater-policy.json` is the repository-owned admission record. The protected release preflight consumes it through `scripts/checks/verify_release_updater_policy.py`.

The current policy is deliberately `blocked`. BandScope does not yet have an organization-approved updater signing public key and immutable production HTTPS endpoint. A version tag therefore cannot become a commercial release merely because ordinary desktop packaging succeeds.

## Problem

Tauri v2 requires update artifacts to be signed and verifies them with a public key embedded in updater configuration. The updater signature check cannot be disabled. Tauri also requires `bundle.createUpdaterArtifacts` to generate update bundles/signatures and requires production endpoints to use TLS unless an explicitly dangerous insecure-transport option is enabled.

Before this change, BandScope's release work described those requirements but no executable repository contract distinguished these states:

- updater authority is absent and commercial tag publication must remain blocked;
- updater authority is present but Tauri config drifts to a different key or endpoint;
- updater artifact generation is not enabled;
- an insecure updater transport escape hatch is enabled.

That gap allowed a future release branch to satisfy version/model checks while updater trust remained only prose.

## Constraints

- Private updater signing keys never belong in repository files, build artifacts, logs, or policy JSON.
- A public verification key is safe to distribute, but the organization-approved key value is still release authority and must not be invented by an automation writer.
- Production updater endpoints must be exact policy inputs; a generic arbitrary-URL updater would violate the local-first and narrow-capability boundary.
- Ordinary startup and local rehearsal analysis must remain usable while the updater service is unavailable.
- Distribution owns update publication and trust. Active Player, Project Persistence, Signal/MIR, and Resource Admission do not receive duplicate updater authority.

## Implemented contract

`verify_release_updater_policy.py` reads only fixed repository-relative policy and Tauri configuration files. Both are bounded regular non-link files, and JSON duplicate members are rejected.

For `state=blocked`, the guard requires:

- `publicKey` is `null`;
- `endpoints` is empty;
- a non-empty reason is recorded;
- Tauri updater artifact generation is absent/disabled;
- Tauri updater plugin configuration is absent;
- tag/release callers using `require_admitted=True` fail closed.

For a future `state=admitted`, the guard requires:

- one bounded literal public verification key;
- one to four unique HTTPS endpoints without userinfo or fragments;
- exact key/endpoint equality between policy and Tauri configuration;
- `bundle.createUpdaterArtifacts=true`;
- `dangerousInsecureTransportProtocol` is not enabled;
- a valid SemVer `minimumSupportedVersion` and an explicit stable/beta channel.

`verify_release_identity.py` composes this guard with the existing version and commercial-model admission guards. `package_desktop_artifact.py` already invokes that release preflight before creating `artifacts/` for version tags, so updater admission is now on the same fail-closed path as tag packaging rather than a detached audit.

## Alternatives rejected

### Check only whether a public key string exists

Rejected. A key without exact endpoint/config projection still allows authority drift, and a string-presence check does not prove updater artifacts are generated.

### Enable Tauri updater with placeholder key or endpoint

Rejected. Placeholder release authority is materially worse than an explicit blocked state because it can be mistaken for production readiness or accidentally shipped.

### Allow HTTP for development and rely on environment discipline

Rejected for commercial admission. Tauri exposes `dangerousInsecureTransportProtocol`; production policy explicitly refuses that escape hatch. Development-only update experiments should remain separate from the release authority.

### Put the private signing key in policy

Rejected. Tauri's private signing key is secret release authority. Repository policy may bind the public verification key only; private-key custody belongs to the external signing/secret-management boundary.

## Claim boundary

This change proves that BandScope cannot label a version-tag build commercially updater-ready while updater authority is absent or the admitted Tauri projection drifts.

It does **not** yet prove:

- that an approved signing key has been provisioned;
- that Tauri updater plugin/runtime dependencies are installed and initialized;
- that `.sig` files are generated and published for every supported target;
- that a static/dynamic updater manifest is immutable and bound to exact release receipts;
- that wrong-key/wrong-signature, stale/replayed metadata, partial download, disk-full, cancellation, first-launch failure, staged rollout, deferral, retry, or rollback behavior has passed packaged Windows/macOS acceptance;
- that project-schema compatibility permits a given rollback.

Those remain repository-owned work under #960 once external updater key/endpoint authority is available, except for signer/key ownership itself.

## Test evidence

`services/analysis-engine/tests/test_release_updater_policy.py` covers:

- current checked-in blocked authority;
- tag-preflight composition;
- exact admitted public-key and HTTPS-endpoint projection;
- endpoint drift and insecure transport;
- missing updater artifact generation;
- a blocked policy hiding partially enabled updater capability;
- duplicate-member JSON ambiguity.

Hosted current-head CI remains authoritative for merge/release status.

## References

Tauri Contributors. (2026). *Updater*. Tauri v2 documentation. https://v2.tauri.app/plugin/updater/

Semantic Versioning. (n.d.). *Semantic Versioning 2.0.0*. https://semver.org/spec/v2.0.0.html
