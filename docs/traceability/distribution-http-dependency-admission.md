# Distribution HTTP dependency admission traceability

Status: implemented pre-compilation dependency gate; production HTTP adapter remains pending.

## Problem

BandScope's Distribution transport policy is ready to consume real HTTP response state, but the production client dependency has not yet been admitted. That dependency decision became security-relevant on 2026-09-14 when RustSec published `RUSTSEC-2026-0285` for `rustls`: TLS 1.3 handshake messages could be accepted across an encryption-level transition when they followed a key-changing message in the same record. RustSec marks `rustls >=0.23.13,<0.23.45` as affected and `>=0.23.45` as patched.

The planned client, `reqwest`, enables `default-tls` through its default feature set. In reqwest 0.13.5, the default set also includes HTTP/2 and system-proxy behavior. Reqwest documents that `default-tls` currently selects rustls but is intentionally backend-agnostic and can take precedence when another crate enables it. A Distribution-owned release path therefore cannot treat `reqwest = "..."` or an affected rustls lock as an acceptable implementation shortcut.

Reqwest 0.13.5 exposes four native-TLS feature spellings: `native-tls`, `native-tls-no-alpn`, `native-tls-vendored`, and `native-tls-vendored-no-alpn`. The initial admission checker rejected the first three but accidentally omitted `native-tls-vendored-no-alpn`, so a future manifest could satisfy the explicit `rustls` requirement while simultaneously selecting a second TLS backend through that spelling. The gate now treats the published reqwest feature surface as an exhaustive alternate-backend set instead of relying on a partial prefix convention.

This finding does not prove that an existing transitive `rustls` entry elsewhere in BandScope is exploitable. The gate is deliberately activated when `apps/desktop/distribution-transport/Cargo.toml` acquires a direct `reqwest` dependency, because that is the repository-owned production HTTP boundary being prepared here.

## Constraints

- The production updater client must remain in the Distribution bounded context and must not reimplement metadata, project persistence, authentication, or installer ownership.
- A direct `reqwest` dependency must use table syntax with `default-features = false` and explicitly select the `rustls` feature.
- `default-tls`, `native-tls`, `native-tls-no-alpn`, `native-tls-vendored`, and `native-tls-vendored-no-alpn` are rejected for this owner because they weaken exact backend evidence across Windows, macOS, and Linux.
- The standalone `apps/desktop/distribution-transport/Cargo.lock` is authoritative for the HTTP adapter's resolved Rust graph.
- If that standalone graph contains `rustls >=0.23.13,<0.23.45`, CI must fail with `RUSTSEC-2026-0285` before any Distribution platform build starts.
- A missing reqwest or rustls lock entry after direct reqwest admission is a failure, not an implicit resolver fallback.
- Later unaffected rustls lines remain admissible; the check encodes the advisory range rather than freezing BandScope to one minor release.
- The dependency gate does not replace `cargo audit`, GitHub dependency review, OSV, SBOM generation, or release-time artifact provenance.
- HTTP behavior remains a separate code contract. The eventual `reqwest::ClientBuilder` must explicitly select the rustls backend at runtime and disable automatic redirects and gzip/brotli/zstd/deflate decoding even if Cargo feature unification enables additional capabilities elsewhere.

## Alternatives considered

Using reqwest defaults was rejected because the default TLS backend is intentionally not a stable backend-selection contract and the default feature set admits network behavior that BandScope has not explicitly accepted. Selecting native TLS was rejected for this owner because it produces materially different TLS stacks on Windows, macOS, and Linux and would make cross-platform release evidence harder to compare. Admitting an affected rustls lock with a local exception was rejected because a patched release already exists, so the repository's vulnerability-exception rule does not apply.

Treating `native-tls*` as a documentation shorthand without testing every current reqwest feature spelling was rejected after review of reqwest 0.13.5's published feature table. Cargo features are exact strings and additive; omitting one valid alternate-backend feature makes the admission rule bypassable even when the prose says `native-tls*` is forbidden.

Rejecting every rustls version below 0.23.45 was also rejected. RustSec explicitly lists versions below 0.23.13 as unaffected by this advisory, and future 0.24+ lines should not fail a check written for a 0.23 advisory. The selected check therefore models the published affected interval exactly.

Scanning every Cargo.lock in the repository and treating any affected transitive rustls as proof that the new updater client is vulnerable was rejected as an ownership error. The executable admission is tied to the standalone Distribution transport manifest and lock. Existing transitive graphs remain covered by the repository-wide supply-chain controls and require their own exposure analysis if an advisory is reported there.

## Selected design

`scripts/checks/verify_distribution_http_dependencies.py` is a dependency-free Python 3 gate using `tomllib`. With no direct reqwest dependency in the Distribution transport manifest it returns success and does not infer exposure from unrelated graphs. Once reqwest is declared directly, it requires explicit rustls backend ownership, rejects every published reqwest 0.13.5 default/native-TLS alternate feature, requires a committed standalone lock containing reqwest and rustls, and rejects every locked rustls version inside the `RUSTSEC-2026-0285` affected interval.

`.github/workflows/ci.yml` runs this check in `lock-validation` immediately after checkout. The Distribution Windows/macOS/Linux Rust jobs depend on that job, so an unsafe future HTTP graph is rejected before those crates compile rather than after a platform matrix has already exercised it. `scripts/harness/quickcheck.sh` invokes the same checker so local canonical validation and hosted admission share one rule.

The regression suite uses synthetic Cargo manifest/lock fixtures only for policy-unit coverage. It proves rejection of rustls 0.23.44, acceptance of 0.23.45 and 0.24.0, non-activation when Distribution has no direct reqwest dependency, rejection of implicit reqwest TLS feature selection, and rejection of the previously omitted `native-tls-vendored-no-alpn` spelling. Those fixtures are not production networking evidence.

## RED -> repair evidence

- `7904f1097484657083bc340a00e403b2f60c03f2` introduced the dependency-admission regression contract before the checker existed. The predecessor therefore had no repository-controlled rule capable of rejecting a future direct reqwest graph on `RUSTSEC-2026-0285` grounds.
- `40496d5589f4903970fc54522256e4c31807ab44` added the fail-closed checker, corrected the regression fixtures for repository docstring/lint policy, and wired the gate before Distribution platform compilation.
- `3def1e1f65dd30bc72d6b6eb409282aaddac4789` wired the same dependency gate into canonical local quickcheck so local and hosted policy could not drift.
- `5f81143b59456a876e18b2879dc78af6ac2c3c1e` added a RED contract for reqwest 0.13.5's `native-tls-vendored-no-alpn` feature, which the then-current forbidden set did not detect.
- `b26fc7ddc8895c06618b25485000b3f97f7619d9` completed the alternate-backend feature set and makes that manifest fail admission.

Hosted exact-head checks remain authoritative for repository integration. This source-level gate does not claim that the production HTTP adapter exists, that remote metadata is authenticated, that updater artifact signatures have been verified, or that current packaged Windows/macOS network behavior is release-ready.

## Follow-up

The next Distribution implementation may add reqwest only together with a lock graph that passes this admission. The client must then use explicit `ClientBuilder::tls_backend_rustls()` selection, no implicit redirects, no transparent response decompression, bounded response streaming into `distribution-download`, and realistic network/cancel/disk-full/captive-portal evidence. Cryptographic metadata and sealed-descriptor promotion remain subsequent gates.

## References

RustSec. (2026, September 14). *RUSTSEC-2026-0285: rustls: TLS 1.3 handshake messages incorrectly accepted across encryption level boundaries*. RustSec Advisory Database. https://rustsec.org/advisories/RUSTSEC-2026-0285.html

Reqwest project. (2026). *Cargo feature table (reqwest 0.13.5)*. Docs.rs. https://docs.rs/crate/reqwest/0.13.5/source/Cargo.toml.orig

Reqwest project. (2026). *TLS configuration and types (reqwest 0.13.5)*. Docs.rs. https://docs.rs/reqwest/0.13.5/reqwest/tls/

Reqwest project. (2026). *ClientBuilder (reqwest 0.13.5)*. Docs.rs. https://docs.rs/reqwest/0.13.5/reqwest/struct.ClientBuilder.html
