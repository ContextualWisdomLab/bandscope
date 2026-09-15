# Release version identity traceability

## Problem

BandScope's release preflight previously required `VERSION` to be one trimmed line and required `package.json`, `tauri.conf.json`, and an optional `v<VERSION>` tag to agree with it, but it did not constrain the version grammar itself. The native Distribution/update policy core already accepts only canonical stable `MAJOR.MINOR.PATCH` values with no leading zeros, prerelease suffix, or build metadata.

That mismatch allowed a future stable-channel source such as `1.2.3-rc.1`, `1.2.3+build.7`, or `01.2.3` to pass repository release identity and reach tag packaging even though the runtime updater would later reject the same release identity. This is a Distribution release-truth defect: publication and consumption must use the same stable-channel grammar before any artifact write begins.

## Decision

`verify_release_identity.py` is the release-pipeline grammar gate because `package_desktop_artifact.py` invokes release preflight before creating release artifacts. Stable-channel `VERSION` now must match exact numeric `MAJOR.MINOR.PATCH` with each component either `0` or a non-zero digit followed by digits.

The rule intentionally matches `apps/desktop/distribution-core::StableVersion`. It does not broaden the runtime to prerelease/build SemVer. A future beta/prerelease channel requires a separate explicit release decision and one canonical ordering implementation rather than letting publication and runtime evolve independently.

## RED → repair evidence

- RED `9d1dc2f43e4149df9bcef8afa8859d872b663600` adds release-identity regression cases for prerelease, build metadata, leading-zero components, incomplete versions, and a `v`-prefixed version authority. The predecessor guard accepts those values when all projections agree, so the new contract fails there.
- Causal fix `e268c9bbb0dd9a0e977a5b757c8426fe8d2112be` adds the canonical stable-version gate to `verify_release_identity.py` before package/Tauri/tag projection comparison.
- The checked-in current authority remains `0.1.3`; this repair changes future admission, not the identity of the current source tree.

## Alternatives rejected

### Rely on package-manager version parsing

Rejected. Release authority is consumed by Python preflight, Tauri configuration, native Distribution code, Git tags, and updater publication. A package manager accepting a string is not a cross-boundary release contract.

### Validate only in the updater-manifest builder

Rejected. Tag packaging and release identity exist before manifest construction. The earliest shared release gate must reject an identity the runtime cannot consume, rather than allowing earlier artifacts to be written and failing later.

### Permit full SemVer in publication while keeping numeric-only runtime ordering

Rejected. Prerelease precedence and build metadata semantics would then differ across publication and consumption. Stable channel remains numeric-only until a beta-channel design owns ordering, rollback, replay, and compatibility semantics end to end.

## Claim boundary

This repair proves only that repository-controlled stable release preflight and the native updater decision core agree on version grammar. It does not authenticate remote updater metadata, verify updater signatures, provision signing authority, prove packaged update/recovery behavior, or make the current blocked updater/model policies commercially releasable.

Hosted exact-head CI and independent review remain required before merge. Version grammar agreement does not substitute for Windows/macOS signing, updater-key authority, immutable release publication, or rights-cleared real-audio scientific acceptance.

## References

Preston-Werner, T. (n.d.). *Semantic Versioning 2.0.0*. https://semver.org/spec/v2.0.0.html
