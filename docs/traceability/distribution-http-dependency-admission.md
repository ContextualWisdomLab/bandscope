# Distribution HTTP dependency admission traceability

Status: implemented pre-compilation dependency gate; production HTTP adapter remains pending.

## Problem

BandScope's Distribution transport policy is ready to consume real HTTP response state, but the production client dependency has not yet been admitted. That dependency decision became security-relevant on 2026-09-14 when RustSec published `RUSTSEC-2026-0285` for `rustls`: TLS 1.3 handshake messages could be accepted across an encryption-level transition when they followed a key-changing message in the same record. RustSec marks `rustls >=0.23.13,<0.23.45` as affected and `>=0.23.45` as patched.

The planned client, `reqwest`, enables `default-tls` through its default feature set. In reqwest 0.13.5, the default set also includes HTTP/2 and system-proxy behavior. Reqwest documents that `default-tls` currently selects rustls but is intentionally backend-agnostic and can take precedence when another crate enables it. A Distribution-owned release path therefore cannot treat `reqwest = "..."` or an affected rustls lock as an acceptable implementation shortcut.

Reqwest 0.13.5 exposes optional behavior that changes updater transport semantics before BandScope sees exact response bytes: gzip, Brotli, Zstandard and deflate response decoding; system/SOCKS proxy routing; alternate DNS resolution; and HTTP/2 or experimental HTTP/3 protocol activation. `Response::chunk()` is available without reqwest's optional `stream` feature, so the updater transport has no current requirement for any direct reqwest feature beyond `rustls`. The dependency gate therefore uses an allow-list rather than trying to maintain independent deny-lists for TLS, decompression, proxy and protocol features.

The preceding checker used a narrower TLS deny-list. It correctly rejected the affected rustls interval and the known native-TLS feature spellings, but a future manifest such as `features = ["rustls", "gzip"]` would still have passed pre-compilation admission. Reqwest documents that enabling `gzip`, `brotli`, `zstd` or `deflate` turns automatic response decompression on by default and can remove `Content-Encoding` and `Content-Length` before application code observes the response. That is incompatible with BandScope's requirement that `distribution-transport` admit the exact wire response metadata and that `distribution-download` receive the exact updater artifact bytes.

A second review of the executable gate found an ownership-location bypass after the feature allow-list was added. The checker originally read only top-level `[dependencies].reqwest`. Cargo permits normal runtime dependencies under target-scoped tables such as `[target.'cfg(windows)'.dependencies]`; a future Windows-only or macOS-only reqwest declaration there would have activated the production client while the checker returned early as if Distribution had no direct HTTP dependency. Target-scoped normal dependencies therefore belong to the same owner admission surface as unconditional normal dependencies.

Fresh review then found a third bypass in dependency identity. Cargo explicitly permits a dependency key to differ from the package name by using `package = "..."`. For example, `distribution_http = { package = "reqwest", ... }` is still a direct runtime dependency on the reqwest package. The previous checker matched only the TOML key `reqwest`, so a renamed reqwest dependency could make the gate return early and skip the feature/TLS/lock admission entirely. The gate must therefore identify owner dependencies by Cargo package identity, not by the local dependency alias.

A fourth review found the same identity gap through Cargo workspace inheritance. This crate is itself a workspace root, so `[workspace.dependencies]` can define `distribution_http = { package = "reqwest", ... }` while `[dependencies]` activates it with `distribution_http = { workspace = true, ... }`. Cargo makes inherited features additive with the workspace declaration. A checker that examines only the local declaration cannot know that the effective package is reqwest or that workspace and local feature sets combine. Until BandScope has a concrete reason to share this security-sensitive client through workspace inheritance, inherited reqwest is rejected rather than partially reconstructing Cargo feature resolution in a Python preflight.

The final source review in this slice found that package identity and TLS features were still insufficient supply-chain admission. Cargo can source a package from git, a local path or an alternate registry while retaining the package name `reqwest`, and a `[patch.crates-io]` override can similarly replace the resolved `rustls` package while preserving a safe-looking version. The repository dependency policy already requires direct git refs and equivalent nonstandard sources to be rejected or explicitly excepted. Distribution therefore admits only a versioned crates.io reqwest declaration and requires both resolved reqwest and rustls lock entries to carry the canonical crates.io registry source. A version string alone is not accepted as provenance.

This finding does not prove that an existing transitive `rustls` entry elsewhere in BandScope is exploitable. The gate is deliberately activated when `apps/desktop/distribution-transport/Cargo.toml` acquires a direct runtime `reqwest` package dependency, unconditional or target-scoped and regardless of its local Cargo alias, because that is the repository-owned production HTTP boundary being prepared here.

## Constraints

- The production updater client must remain in the Distribution bounded context and must not reimplement metadata, project persistence, authentication, or installer ownership.
- Any direct runtime reqwest package dependency, whether under top-level `[dependencies]` or a Cargo `[target.<selector>.dependencies]` table and whether named `reqwest` locally or renamed with `package = "reqwest"`, must use table syntax with `default-features = false` and exactly the approved direct feature set: `features = ["rustls"]`.
- A reqwest package inherited with `workspace = true` is not currently admitted. The Distribution transport must declare the package, version, default-feature policy and direct feature set in its own runtime dependency table so the owner contract is reviewable without reconstructing additive workspace feature inheritance.
- Direct reqwest declarations may use only `version`, optional `package` rename metadata, `default-features`, and `features`. Git, path, alternate-registry, branch/tag/rev and optional/source indirection are not admitted without a new owner decision and dependency-policy exception.
- The committed standalone lock must resolve reqwest and rustls from `registry+https://github.com/rust-lang/crates.io-index`; git/path/alternate-registry entries are rejected even when the package name and version look acceptable.
- `dev-dependencies` and `build-dependencies` do not activate the production client and are not treated as runtime owner declarations by this gate.
- Additional direct reqwest features are rejected until a concrete Distribution requirement, threat analysis, tests and traceability justify widening the allow-list. This currently rejects native/default TLS alternatives, transparent decompression, proxy, alternate DNS and HTTP/2/HTTP/3 feature activation at the owner manifest.
- Runtime code must still call `ClientBuilder::tls_backend_rustls()`. Cargo features are additive across the dependency graph, so the manifest allow-list is not a substitute for explicit runtime backend selection.
- Runtime code must also call `no_gzip()`, `no_brotli()`, `no_zstd()`, `no_deflate()`, `redirect(Policy::none())` and `no_proxy()`. Reqwest intentionally provides the `no_*` decompression methods even when the corresponding optional feature is not selected so an additive transitive feature cannot silently change client behavior.
- The standalone `apps/desktop/distribution-transport/Cargo.lock` is authoritative for the HTTP adapter's resolved Rust graph.
- If that standalone graph contains `rustls >=0.23.13,<0.23.45`, CI must fail with `RUSTSEC-2026-0285` before any Distribution platform build starts.
- A missing reqwest or rustls lock entry after direct reqwest admission is a failure, not an implicit resolver fallback.
- Later unaffected rustls lines remain admissible; the check encodes the advisory range rather than freezing BandScope to one minor release.
- The dependency gate does not replace `cargo audit`, GitHub dependency review, OSV, SBOM generation, or release-time artifact provenance.

## Alternatives considered

Using reqwest defaults was rejected because the default TLS backend is intentionally not a stable backend-selection contract and the default feature set admits network behavior that BandScope has not explicitly accepted. Selecting native TLS was rejected for this owner because it produces materially different TLS stacks on Windows, macOS, and Linux and would make cross-platform release evidence harder to compare. Admitting an affected rustls lock with a local exception was rejected because a patched release already exists, so the repository's vulnerability-exception rule does not apply.

Maintaining separate forbidden-feature sets for native TLS, decompression, proxies and protocols was rejected after the feature review. Reqwest features are additive and its public feature surface can grow; a deny-list fails open whenever a newly relevant feature is omitted. The selected allow-list has the inverse property: a new direct feature requires an explicit repository decision before it can enter the release transport.

Inspecting only top-level `[dependencies]` was rejected because Cargo target tables can declare the same normal runtime dependency for one platform. Distribution supports Windows and macOS explicitly; platform scoping changes where the dependency is declared, not who owns its network/TLS semantics. The checker therefore enumerates both unconditional and target-scoped normal dependency tables and applies the same declaration policy to each one.

Matching only a dependency key literally named `reqwest` was rejected because Cargo's `package` key is the authoritative package-selection mechanism when a dependency is renamed. A local alias changes the Rust/Cargo-facing dependency name, not the upstream package being introduced into the Distribution runtime graph. The checker therefore resolves each normal dependency declaration to its Cargo package name first and applies reqwest policy whenever that package name is `reqwest`.

Trying to admit workspace-inherited reqwest by merging `[workspace.dependencies]` and local `features` inside the policy script was rejected for now. Cargo explicitly makes inherited feature lists additive, and inherited default-feature behavior has edition/toolchain semantics. Duplicating that resolver logic in a small Python gate would create a second dependency-resolution authority. The safer current contract is to identify inherited reqwest through the workspace package declaration and reject it until a deliberate owner decision adds equivalent executable resolution evidence.

Allowing git/path/alternate-registry reqwest or a patched/forked rustls solely because the package name and version match was rejected. That would let a source substitution bypass the direct dependency admission evidence while leaving a superficially acceptable Cargo graph. The chosen policy uses ordinary crates.io source provenance for this small release-security owner; any future source exception must be explicit and reviewed under the repository dependency policy rather than silently inferred by the checker.

Enabling reqwest's optional `stream` feature was rejected for the current adapter design because `Response::chunk()` already provides bounded asynchronous chunk retrieval without that feature. Avoiding `stream` also avoids an unnecessary `futures`/`tokio-util` surface in this small security-sensitive owner.

Rejecting every rustls version below 0.23.45 was also rejected. RustSec explicitly lists versions below 0.23.13 as unaffected by this advisory, and future 0.24+ lines should not fail a check written for a 0.23 advisory. The selected check therefore models the published affected interval exactly.

Scanning every Cargo.lock in the repository and treating any affected transitive rustls as proof that the new updater client is vulnerable was rejected as an ownership error. The executable admission is tied to the standalone Distribution transport manifest and lock. Existing transitive graphs remain covered by the repository-wide supply-chain controls and require their own exposure analysis if an advisory is reported there.

## Selected design

`scripts/checks/verify_distribution_http_dependencies.py` is a dependency-free Python 3 gate using `tomllib`. It enumerates direct runtime dependency declarations from top-level `[dependencies]` and every `[target.<selector>.dependencies]` table, resolves each declaration's package identity using Cargo's `package` rename semantics, and follows `workspace = true` only far enough to determine the inherited workspace package identity. Every declaration whose effective package is `reqwest` enters the owner gate. Workspace-inherited reqwest is rejected. A directly declared reqwest package must use only the approved declaration-key set, include an explicit version requirement, own the rustls backend, and use exactly the direct feature set `{rustls}`. The gate then requires a committed standalone lock containing reqwest and rustls from the canonical crates.io registry source and rejects every locked rustls version inside the `RUSTSEC-2026-0285` affected interval.

`.github/workflows/ci.yml` runs this check in `lock-validation` immediately after checkout. The Distribution Windows/macOS/Linux Rust jobs depend on that job, so an unsafe future HTTP graph is rejected before those crates compile rather than after a platform matrix has already exercised it. `scripts/harness/quickcheck.sh` invokes the same checker so local canonical validation and hosted admission share one rule.

The regression suite uses synthetic Cargo manifest/lock fixtures only for policy-unit coverage. It proves rejection of rustls 0.23.44, acceptance of 0.23.45 and 0.24.0, non-activation when Distribution has no direct reqwest dependency, rejection of implicit reqwest TLS feature selection, rejection of unapproved direct transport features including gzip/Brotli/Zstandard/deflate decoding, system/SOCKS proxy, alternate DNS, HTTP/2 and HTTP/3, rejection of the same invalid reqwest declaration when it is moved under a Windows target dependency table, rejection when the reqwest package is renamed to another local dependency key, rejection when renamed reqwest is hidden behind workspace dependency inheritance, rejection of git/path/alternate-registry reqwest sources, and rejection of a non-crates.io rustls lock source. Those fixtures are not production networking evidence.

## RED -> repair evidence

- `7904f1097484657083bc340a00e403b2f60c03f2` introduced the dependency-admission regression contract before the checker existed. The predecessor therefore had no repository-controlled rule capable of rejecting a future direct reqwest graph on `RUSTSEC-2026-0285` grounds.
- `40496d5589f4903970fc54522256e4c31807ab44` added the fail-closed checker, corrected the regression fixtures for repository docstring/lint policy, and wired the gate before Distribution platform compilation.
- `3def1e1f65dd30bc72d6b6eb409282aaddac4789` wired the same dependency gate into canonical local quickcheck so local and hosted policy could not drift.
- `5f81143b59456a876e18b2879dc78af6ac2c3c1e` added a RED contract for reqwest 0.13.5's `native-tls-vendored-no-alpn` feature, which the then-current forbidden set did not detect.
- `b26fc7ddc8895c06618b25485000b3f97f7619d9` completed that alternate-backend deny-list.
- `621bac6b543255e1fd6c01ce03068c8870a43773` added a RED contract proving that the narrower checker still admitted `features = ["rustls", "gzip"]`, even though gzip activation can transparently transform response bytes and strip transport headers before BandScope admission.
- `43d786362a15afa23824878091c2edea07b474bd` replaced feature-specific deny-listing with the exact direct reqwest allow-list `{"rustls"}`.
- `eb10409b07d26247d6060466b93ad37ec02f9870` expanded edge coverage across transparent decompression, proxy, DNS and HTTP protocol feature classes so a future widening of the allow-list is an explicit contract change.
- `d36c4d647ace77d8a0d68a2e3690460cadd980ed` added a RED contract moving the invalid `rustls + gzip` declaration under `[target.'cfg(windows)'.dependencies]`; the preceding checker treated the manifest as having no direct reqwest dependency.
- `da209f160bcf4e81cc70cf4760ad658c9d78c679` makes target-scoped normal runtime reqwest declarations enter the same fail-closed owner admission as top-level declarations.
- `7330af6e40a6ba5b4c49c9de32abf291dd7c515b` adds the Cargo-rename RED: `distribution_http = { package = "reqwest", ..., features = ["rustls", "gzip"] }` must be treated as the same direct reqwest owner dependency rather than bypassing admission because the local key is not `reqwest`.
- `5356dcfa9a1a75c7cecdf6d185e7359cc056929a` resolves normal dependency declarations to Cargo package identity before selecting reqwest, so unconditional and target-scoped renamed dependencies enter the same policy path.
- `cf6655d134ebcae57037be2a21a1c8f777437ace` adds the workspace-inheritance RED: a local `workspace = true` dependency whose workspace package is renamed reqwest must not make the gate return early.
- `8284ae6ccc5034ad4ab1e94f201e125d25f975da` resolves the workspace package identity for admission and fails closed on inherited reqwest instead of implementing a partial Cargo feature resolver.
- `a8d91b349054a6bebdc069071761c2010829c51c` adds RED coverage for git, local-path and alternate-registry reqwest declarations; the preceding gate accepted their package name/features without validating source provenance.
- `914609c8f33b0f06809d5ef3b47fdfd67e552568` restricts direct reqwest declaration controls to the versioned crates.io form and requires canonical crates.io reqwest lock provenance.
- `e6a0663255c3164fade5be5105d2dc05f6fb7183` adds the corresponding RED for a safe-looking rustls `0.23.45` lock entry sourced from git.
- `4fdc294a2077b4c1d1b7d5e6a7a831a60c98aced` applies the same canonical crates.io lock-source requirement to rustls before advisory-range admission.

Hosted exact-head checks remain authoritative for repository integration. This source-level gate does not claim that the production HTTP adapter exists, that remote metadata is authenticated, that updater artifact signatures have been verified, or that current packaged Windows/macOS network behavior is release-ready.

## Follow-up

The next Distribution implementation may add reqwest only together with a lock graph that passes this admission. The client must then use explicit `ClientBuilder::tls_backend_rustls()`, `redirect(Policy::none())`, `no_gzip()`, `no_brotli()`, `no_zstd()`, `no_deflate()` and `no_proxy()`, preserve exact status/effective URL/Location/Content-Encoding, stream bounded response chunks through `Response::chunk()` into `distribution-download`, and produce realistic network/cancel/disk-full/captive-portal evidence. Cryptographic metadata and sealed-descriptor promotion remain subsequent gates.

## References

Rust Project. (2026). *Specifying dependencies: Renaming dependencies in Cargo.toml*. The Cargo Book. https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#renaming-dependencies-in-cargotoml

Rust Project. (2026). *Workspaces: The dependencies table*. The Cargo Book. https://doc.rust-lang.org/cargo/reference/workspaces.html#the-dependencies-table

RustSec. (2026, September 14). *RUSTSEC-2026-0285: rustls: TLS 1.3 handshake messages incorrectly accepted across encryption level boundaries*. RustSec Advisory Database. https://rustsec.org/advisories/RUSTSEC-2026-0285.html

Reqwest project. (2026). *Cargo feature table (reqwest 0.13.5)*. Docs.rs. https://docs.rs/crate/reqwest/0.13.5/features

Reqwest project. (2026). *TLS configuration and types (reqwest 0.13.5)*. Docs.rs. https://docs.rs/reqwest/0.13.5/reqwest/tls/

Reqwest project. (2026). *Response (reqwest 0.13.5)*. Docs.rs. https://docs.rs/reqwest/0.13.5/reqwest/struct.Response.html

Reqwest project. (2026). *ClientBuilder (reqwest 0.13.5)*. Docs.rs. https://docs.rs/reqwest/0.13.5/reqwest/struct.ClientBuilder.html
