# Release version identity traceability

## Problem

BandScope's release preflight originally required `VERSION` to be one trimmed line and required `package.json`, `tauri.conf.json`, and an optional `v<VERSION>` tag to agree with it, but it did not constrain the version grammar itself. The native Distribution/update policy core accepts only canonical stable `MAJOR.MINOR.PATCH` values with no leading zeros, prerelease suffix, or build metadata, and each numeric component is parsed as Rust `u64`.

The first grammar repair rejected prerelease/build/leading-zero forms, but fresh review found one remaining cross-language mismatch: Python's regular expression still accepted arbitrarily large decimal components while `distribution-core::StableVersion` rejects any component above `u64::MAX` (`18446744073709551615`). A source version such as `18446744073709551616.0.0` could therefore pass release preflight and reach packaging even though the runtime updater would reject the same release identity. Publication and consumption must use the same stable-channel domain before any artifact write begins.

## Decision

`verify_release_identity.py` is the release-pipeline version gate because `package_desktop_artifact.py` invokes release preflight before creating release artifacts. Stable-channel `VERSION` must match exact numeric `MAJOR.MINOR.PATCH`; each component is `0` or a non-zero decimal without leading zeros and must also fit the same unsigned 64-bit range consumed by `distribution-core::StableVersion`.

The Python guard compares decimal text against the exact `u64::MAX` decimal boundary instead of converting arbitrary-length input to Python integers. This keeps the accepted domain explicit and avoids a second numeric interpretation. The rule intentionally does not broaden the runtime to prerelease/build SemVer. A future beta/prerelease channel requires a separate release decision and one canonical ordering implementation.

## RED → repair evidence

- RED `9d1dc2f43e4149df9bcef8afa8859d872b663600` adds release-identity regression cases for prerelease, build metadata, leading-zero components, incomplete versions, and a `v`-prefixed version authority. The predecessor guard accepted those values when all projections agreed.
- Causal fix `e268c9bbb0dd9a0e977a5b757c8426fe8d2112be` adds the canonical numeric-triplet grammar gate to `verify_release_identity.py` before package/Tauri/tag projection comparison.
- Fresh range RED `1cf96561008d11f6afc06f1c3ca1eff85fd7bd03` adds overflow cases for major, minor, and patch at `u64::MAX + 1`. The grammar-only predecessor accepts those strings while the native `StableVersion` rejects them.
- Causal range fix `1c44f25790ef27691a9ae86484f67e87c725c16f` makes release preflight enforce the exact unsigned-64-bit component ceiling without widening the accepted syntax or adding a new version owner.
- The checked-in current authority remains `0.1.3`; these repairs change future admission, not the identity of the current source tree.

## Alternatives rejected

### Rely on package-manager version parsing

Rejected. Release authority is consumed by Python preflight, Tauri configuration, native Distribution code, Git tags, and updater publication. A package manager accepting a string is not a cross-boundary release contract.

### Treat the regular expression as equivalent to the Rust parser

Rejected. Lexical grammar and numeric domain are different constraints. An unbounded decimal token can satisfy the regular expression while overflowing `u64`, which would recreate publication/runtime drift at the exact trust boundary this guard owns.

### Convert arbitrary decimal strings directly with Python `int`

Rejected. Python integers are not the runtime domain, and very large decimal conversions introduce interpreter-specific digit limits and needless work. Length plus lexicographic comparison against the fixed 20-digit `u64::MAX` representation expresses the actual native contract directly.

### Validate only in the updater-manifest builder

Rejected. Tag packaging and release identity exist before manifest construction. The earliest shared release gate must reject an identity the runtime cannot consume rather than allowing earlier artifacts to be written and failing later.

### Permit full SemVer in publication while keeping numeric-only runtime ordering

Rejected. Prerelease precedence and build metadata semantics would then differ across publication and consumption. Stable channel remains numeric-only until a beta-channel design owns ordering, rollback, replay, and compatibility semantics end to end.

## Claim boundary

This repair proves only that repository-controlled stable release preflight and the native updater decision core agree on version syntax and numeric component range. It does not authenticate remote updater metadata, verify updater signatures, provision signing authority, prove packaged update/recovery behavior, or make the current blocked updater/model policies commercially releasable.

Hosted exact-head CI and independent review remain required before merge. Version-domain agreement does not substitute for Windows/macOS signing, updater-key authority, immutable release publication, or rights-cleared real-audio scientific acceptance.

## References

Preston-Werner, T. (n.d.). *Semantic Versioning 2.0.0*. https://semver.org/spec/v2.0.0.html
