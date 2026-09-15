# Release version identity traceability

## Problem

BandScope's release preflight originally required `VERSION` to be one trimmed line and required `package.json`, `tauri.conf.json`, and an optional `v<VERSION>` tag to agree with it, but it did not constrain the version grammar itself. The native Distribution/update policy core accepts only canonical stable `MAJOR.MINOR.PATCH` values with no leading zeros, prerelease suffix, or build metadata, and each numeric component is parsed as Rust `u64`.

The first grammar repair rejected prerelease/build/leading-zero forms, but fresh review found one remaining cross-language mismatch: Python's regular expression still accepted arbitrarily large decimal components while `distribution-core::StableVersion` rejects any component above `u64::MAX` (`18446744073709551615`). A source version such as `18446744073709551616.0.0` could therefore pass release preflight and reach packaging even though the runtime updater would reject the same release identity. Publication and consumption must use the same stable-channel domain before any artifact write begins.

Fresh review then found a separate file-admission problem in the same release gate. `verify_release_identity.py` described `VERSION`, `package.json`, and `tauri.conf.json` as trusted fixed repository paths, but it used `Path.read_text()` and plain `json.loads()`. A symlinked `VERSION` could therefore be followed, and duplicate JSON members such as two `version` keys were accepted according to Python's last-member-wins behavior. Release identity must not depend on pathname indirection or parser-specific duplicate-member resolution.

A further parser-alignment review found that Python's `json.loads()` also accepts the JavaScript-style numeric constants `NaN`, `Infinity`, and `-Infinity` by default. RFC 8259 explicitly excludes those values from the JSON number grammar. A release projection containing the correct `version` plus one of those constants could therefore pass BandScope preflight while remaining invalid JSON for stricter package, signing, or release consumers. Release identity admission must reject parser extensions that are outside the interchange format rather than treating Python's permissive decoder as the format authority.

The descriptor repair still had one concurrency hole. `_read_bounded_regular_text()` compared descriptor identity and file length before and after one read, but a writer could replace bytes in place without changing inode or length. A same-size rewrite of `package.json` immediately after the read could therefore leave preflight holding the old bytes while the repository path already exposed different release metadata. Size stability is not content stability.

## Decision

`verify_release_identity.py` is the release-pipeline version gate because `package_desktop_artifact.py` invokes release preflight before creating release artifacts. Stable-channel `VERSION` must match exact numeric `MAJOR.MINOR.PATCH`; each component is `0` or a non-zero decimal without leading zeros and must also fit the same unsigned 64-bit range consumed by `distribution-core::StableVersion`.

The Python guard compares decimal text against the exact `u64::MAX` decimal boundary instead of converting arbitrary-length input to Python integers. This keeps the accepted domain explicit and avoids a second numeric interpretation. The rule intentionally does not broaden the runtime to prerelease/build SemVer. A future beta/prerelease channel requires a separate release decision and one canonical ordering implementation.

Release identity inputs are admitted from one opened descriptor each. `VERSION` is capped at 128 bytes; repository JSON projections are capped at 256 KiB. The opened object must be a regular file, its path must resolve to the same non-link file identity at admission, and descriptor device/inode/size must remain stable. The guard now reads the bounded descriptor twice from offset zero and requires byte-for-byte equality between the two snapshots as well as exact length agreement with the descriptor. JSON decoding uses an object-pairs hook that rejects duplicate members before `version` is read. No admitted value is obtained by reopening the pathname after this check.

The double read is deliberately small and deterministic: the largest projection is 256 KiB, there is no network or subprocess boundary, and release preflight runs before packaging rather than in a latency-sensitive product path. It detects same-size in-place mutation during admission without adding a new lock owner or relying on filesystem timestamp granularity.

JSON decoding also supplies an explicit `parse_constant` rejection hook. `NaN`, `Infinity`, and `-Infinity` therefore fail as malformed release metadata instead of entering the object graph as Python floating-point extensions. This keeps the gate aligned with RFC 8259 and with stricter downstream JSON consumers while preserving the existing duplicate-member error path.

## RED → repair evidence

- RED `9d1dc2f43e4149df9bcef8afa8859d872b663600` adds release-identity regression cases for prerelease, build metadata, leading-zero components, incomplete versions, and a `v`-prefixed version authority. The predecessor guard accepted those values when all projections agreed.
- Causal fix `e268c9bbb0dd9a0e977a5b757c8426fe8d2112be` adds the canonical numeric-triplet grammar gate to `verify_release_identity.py` before package/Tauri/tag projection comparison.
- Fresh range RED `1cf96561008d11f6afc06f1c3ca1eff85fd7bd03` adds overflow cases for major, minor, and patch at `u64::MAX + 1`. The grammar-only predecessor accepts those strings while the native `StableVersion` rejects them.
- Causal range fix `1c44f25790ef27691a9ae86484f67e87c725c16f` makes release preflight enforce the exact unsigned-64-bit component ceiling without widening the accepted syntax or adding a new version owner.
- File-admission RED `af893377a17c527df951dc70836c942509c230c3` adds two hostile repository fixtures: a duplicate `package.json.version` whose last member matches the authoritative version, and a symlinked `VERSION` whose target contains an otherwise-valid version. The predecessor `Path.read_text()`/plain `json.loads()` path accepts both.
- Causal file-admission fix `42d34b5e0b0bb01ebc8c6801552e10b9857ab1f0` replaces pathname reads with bounded descriptor reads, rejects non-regular/link identities, verifies descriptor identity/size stability, and rejects duplicate JSON members before projection comparison.
- Strict-JSON RED `68f1bb5531879b8f75d08f1a7e0db84f0b4a36c6` adds `NaN`, `Infinity`, and `-Infinity` fixtures alongside an otherwise-correct release version. Python's default decoder accepts all three even though they are not valid JSON numbers.
- Causal strict-JSON fix `494aa0f5d0b966a1a6e2c5fcc64ab5655c56d5d0` supplies an explicit `parse_constant` rejection hook so non-standard constants fail before any release version projection is consumed.
- Same-size mutation RED `a418640ae4c3775f967bab695422c77ee3d6f32e` rewrites `package.json` from `1.2.3` to `9.9.9` immediately after the first descriptor read while preserving byte length. The predecessor identity/size-only check can return the old bytes even though the repository file has already changed.
- Causal snapshot fix `438dca03c6cfcd2f1d2a1fd6084483d98879270f` performs a second bounded read on the same descriptor from offset zero and requires exact byte equality and stable descriptor identity/size before decoding.
- The checked-in current authority remains `0.1.3`; these repairs change future admission, not the identity of the current source tree.

## Alternatives rejected

### Rely on package-manager version parsing

Rejected. Release authority is consumed by Python preflight, Tauri configuration, native Distribution code, Git tags, and updater publication. A package manager accepting a string is not a cross-boundary release contract.

### Treat the regular expression as equivalent to the Rust parser

Rejected. Lexical grammar and numeric domain are different constraints. An unbounded decimal token can satisfy the regular expression while overflowing `u64`, which would recreate publication/runtime drift at the exact trust boundary this guard owns.

### Convert arbitrary decimal strings directly with Python `int`

Rejected. Python integers are not the runtime domain, and very large decimal conversions introduce interpreter-specific digit limits and needless work. Length plus lexicographic comparison against the fixed 20-digit `u64::MAX` representation expresses the actual native contract directly.

### Trust Git checkout path shape and plain JSON parsing

Rejected. Git can represent symlinks, and JSON duplicate-member behavior is parser-dependent. A release gate should not silently follow a different file object or let a last-member-wins parser choose release identity when another consumer could observe a different projection.

### Accept Python's non-standard JSON numeric constants

Rejected. RFC 8259 does not permit `NaN` or infinities as JSON numbers. Allowing them because Python can materialize them would make preflight validity depend on a decoder extension that stricter release consumers are not required to share.

### Read once and compare only inode and size

Rejected. Same-length in-place writes leave inode and size unchanged. The release gate must know that the bytes it parsed remained stable while it admitted them, not merely that the same file object retained the same length.

### Use timestamps as the content-stability authority

Rejected. Filesystem timestamp precision and update semantics vary by platform, and timestamps are metadata rather than the release bytes themselves. Two bounded reads of at most 256 KiB compare the actual content with negligible release-time cost.

### Add a long-lived repository lock

Rejected. Release preflight does not own Git checkout mutation or the entire packaging transaction. A new lock would create a second repository writer protocol and still would not make later consumers immutable. The guard instead proves stability for its own bounded read boundary and leaves post-gate repository immutability to the release workflow/commit identity contract.

### Validate only in the updater-manifest builder

Rejected. Tag packaging and release identity exist before manifest construction. The earliest shared release gate must reject an identity the runtime cannot consume rather than allowing earlier artifacts to be written and failing later.

### Permit full SemVer in publication while keeping numeric-only runtime ordering

Rejected. Prerelease precedence and build metadata semantics would then differ across publication and consumption. Stable channel remains numeric-only until a beta-channel design owns ordering, rollback, replay, and compatibility semantics end to end.

## Claim boundary

This repair proves that repository-controlled stable release preflight and the native updater decision core agree on version syntax and numeric component range, and that the three release-identity projection files are admitted through bounded, non-link, duplicate-rejecting, strict-standard-JSON descriptors whose two read snapshots must agree byte-for-byte. It does not make the entire checked-out repository immutable against a privileged local actor after the gate completes, prevent a later post-gate checkout mutation, authenticate remote updater metadata, verify updater signatures, provision signing authority, prove packaged update/recovery behavior, or make the current blocked updater/model policies commercially releasable.

Hosted exact-head CI and independent review remain required before merge. Version/file-admission agreement does not substitute for Windows/macOS signing, updater-key authority, immutable release publication, or rights-cleared real-audio scientific acceptance.

## References

Bray, T. (2017). *The JavaScript Object Notation (JSON) Data Interchange Format* (RFC 8259). RFC Editor. https://www.rfc-editor.org/rfc/rfc8259

Preston-Werner, T. (n.d.). *Semantic Versioning 2.0.0*. https://semver.org/spec/v2.0.0.html

Python Software Foundation. (2026). *json — JSON encoder and decoder: `parse_constant`*. Python 3 standard library documentation.

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces: `open`, `fstat`, `lseek`, and `lstat`*. Python 3 standard library documentation.
