# Distribution HTTP lock provenance traceability

Status: implemented pre-compilation supply-chain admission; production HTTP adapter remains pending.

## Problem

The Distribution HTTP admission gate already required the direct `reqwest` declaration and the resolved `reqwest` and `rustls` lock entries to come from crates.io. That was not sufficient to bind the implementation selected by the standalone lock graph. Cargo can override an individual registry dependency through `[patch]` using a git or path source, and the patched package can be a transitive TLS, certificate-validation, crypto, DNS, or protocol dependency rather than `reqwest` or `rustls` themselves. A safe-looking top-level `reqwest`/`rustls` pair therefore did not prove that the rest of the HTTP/TLS implementation came from the reviewed registry source.

For this Distribution owner, that is a pre-compilation admission gap. A future production adapter is security-sensitive and the standalone `apps/desktop/distribution-transport/Cargo.lock` is intended to be the exact resolved graph used by `--locked` builds. A transitive git/path/alternate-registry substitution must not enter that graph without an explicit owner decision merely because the direct packages still look canonical.

Cargo's own documentation distinguishes crates.io, alternate registries, git repositories, and local paths as dependency sources. It also documents `[patch]` as a mechanism that can override dependencies and notes that patches can be supplied from Cargo configuration as well as `Cargo.toml`. Source replacement is a separate mechanism intended for equivalent mirrors or vendored copies. This gate does not attempt to reimplement Cargo resolution; it validates the provenance recorded in the committed standalone lock after resolution.

## Constraints

- This check activates only after `apps/desktop/distribution-transport/Cargo.toml` declares a direct runtime `reqwest` package. Existing unrelated repository lock graphs remain outside this Distribution owner gate.
- The four BandScope Distribution crates in the standalone workspace are local path-owned packages and therefore intentionally have no lock `source`: `bandscope-distribution-core`, `bandscope-distribution-download`, `bandscope-distribution-runtime`, and `bandscope-distribution-transport`.
- Every other package in the active standalone lock graph must record Cargo's canonical crates.io registry source, `registry+https://github.com/rust-lang/crates.io-index`.
- A git source, alternate registry, or source-less external package fails admission even when its name and version match an expected transitive package.
- Adding another local BandScope path package to this standalone graph requires an explicit update to the local-package allow-list; the gate must not infer that an arbitrary source-less package is trusted.
- This policy checks lock provenance, not package integrity by itself. Cargo checksum verification, dependency review, OSV/audit controls, SBOM/provenance generation, platform builds, and release evidence remain separate gates.
- Synthetic lock fixtures are policy-unit evidence only. They do not prove that a production reqwest/rustls graph has been resolved, that a particular transitive package is reachable in a shipped binary, or that real TLS/network behavior is correct.

## Alternatives considered

Enumerating only known TLS transitive package names such as `rustls-webpki`, `ring`, or `aws-lc-rs` was rejected because the graph can change across compatible dependency updates; a package-name deny-list or allow-list would fail open when the TLS stack changes. The source invariant is simpler: once the direct production client is admitted, all external packages in this small standalone owner graph must come from the same reviewed registry source.

Scanning every `Cargo.lock` in BandScope was rejected because it would conflate unrelated bounded contexts with the Distribution HTTP client. Repository-wide supply-chain tooling remains responsible for those graphs; this gate is intentionally attached to the standalone Distribution transport owner.

Relying only on GitHub dependency review after accepting arbitrary git/path substitutions was rejected because the repository already has a pre-compilation owner gate and the production updater path should fail closed before platform builds. A source exception can still be made later, but it must be an explicit reviewed policy change with corresponding threat analysis and evidence rather than an implicit lock substitution.

## Selected design

`scripts/checks/verify_distribution_http_dependencies.py` now validates the provenance of every package entry in the standalone Distribution transport lock once a direct runtime reqwest dependency exists. The four known local Distribution crates must remain source-less path packages. Every other package must record the canonical crates.io registry source. Existing reqwest stable-line and rustls advisory checks then run over that already-admitted graph.

This makes the committed lock graph the executable provenance boundary rather than treating only `reqwest` and `rustls` as security-owned packages. It deliberately does not parse `[patch]`, Cargo configuration, feature unification, or dependency edges itself; Cargo resolves those inputs and the gate judges the resulting committed lock.

## RED -> repair evidence

- `340e7eb795570e244c89890102c88aa043550456` adds policy regressions for two substitutions hidden behind otherwise canonical reqwest/rustls entries: a git-sourced `aws-lc-rs` package and a source-less `rustls-webpki` package. The RED was committed before the checker change; it is not claimed as a separately hosted failing run.
- `92162dad8965095d7ca9852c37f7448184fad3ca` adds whole-lock external-source admission and an explicit local Distribution package allow-list. It also keeps reqwest/rustls version/advisory checks scoped to table-shaped lock entries after graph provenance is validated.

## Claim boundary and next action

This closes one supply-chain admission path only. BandScope still has no production HTTP client in `distribution-transport`, and the current standalone lock contains only the local Distribution crates. The next implementation step remains to add the production reqwest adapter together with a genuinely Cargo-resolved BandScope-owned lock graph, then require exact-head hosted dependency review, SBOM/security gates, platform compilation, and real network/fault acceptance. No TLS safety or release-readiness claim should be inferred from the synthetic provenance fixtures alone.

## Primary references

- The Cargo Book, *Specifying Dependencies*: Cargo dependencies can originate from crates.io/registries, git repositories, or local paths, and local git/path locations can override registry resolution for development.
- The Cargo Book, *Configuration* (`[patch]`): dependency patches can be supplied from Cargo configuration as well as `Cargo.toml`, with configuration patches taking precedence where applicable.
- The Cargo Book, *Source Replacement*: source replacement is intended for equivalent mirrors/vendor sources and is distinct from patching a dependency.
