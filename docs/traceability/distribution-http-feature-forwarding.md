# Distribution HTTP reqwest feature-forwarding admission

Status: Draft implementation evidence on PR #1126. This note records a source-level dependency-admission invariant; it is not proof of a production HTTP client, resolved TLS graph, or real-network acceptance.

## Problem

The Distribution HTTP gate already required a direct `reqwest` declaration with `default-features = false` and direct features exactly `{rustls}`. Cargo, however, permits dependency features to be activated again from the root package's `[features]` table with `dependency/feature` and `dependency?/feature` entries. Cargo also unifies enabled features for a dependency. A manifest could therefore keep the reviewed dependency declaration unchanged while adding, for example, `default = ["reqwest/gzip"]`, causing an ordinary build to compile reqwest with an unreviewed transport feature.

For BandScope this matters because the future updater adapter must preserve exact artifact bytes and make TLS/backend, redirect, decoding, proxy, and DNS behavior explicit. A policy that inspects only `dependencies.reqwest.features` does not establish that invariant if the same manifest can activate additional reqwest features elsewhere.

## Constraints

- Keep the reviewed direct reqwest feature set owned by the runtime dependency declaration rather than reproducing Cargo's complete feature resolver in Python.
- Preserve dependency renaming: `distribution_http = { package = "reqwest", ... }` must be treated exactly like a dependency named `reqwest`.
- Cover Cargo's direct `dependency/feature` and weak `dependency?/feature` forwarding syntax.
- Do not claim that a static manifest check proves the final resolved feature graph. Cargo feature unification can also be influenced by another package that depends on the same reqwest package. Exact production acceptance still requires a genuinely Cargo-resolved BandScope lock and resolved-feature evidence (`cargo tree -e features -i reqwest` or an equivalent Cargo-owned projection) once the production client exists.

## Decision

When a normal unconditional or target-scoped dependency resolves to the `reqwest` package, `scripts/checks/verify_distribution_http_dependencies.py` now scans the root `[features]` table and rejects any member beginning with that dependency key followed by `/` or `?/`. This includes renamed dependency keys. The complete approved reqwest feature set must therefore remain in the direct dependency declaration inspected by the existing gate.

We deliberately do not attempt to evaluate whether a forwarding feature is currently reachable from `default` or a particular CI command. The security invariant is narrower and easier to audit: the Distribution transport manifest must not contain a second source of reqwest feature activation at all.

## RED → repair evidence

- `ed5be008b379f5f07c4325801f1bbba9676fcad1` adds RED regressions for `reqwest/gzip` and a renamed `distribution_http/brotli` forwarding path. These fixtures are policy-unit evidence only; they are not claimed as a separately hosted failing run.
- `bc56faad9bd2582cd6bae4f0b4df43dafc64d9a8` adds dependency-key discovery across unconditional and target-scoped runtime dependencies and rejects root feature forwarding for every reqwest key.
- `0f74972089c4240dbcb7e47d65a8e116bbf099cf` adds the weak `distribution_http?/zstd` edge case so both Cargo forwarding syntaxes are executable contracts.

## Rejected alternatives

Allowing approved forwarding such as `reqwest/rustls` was rejected because it creates a second feature authority without buyer value. Following only `default` feature reachability was rejected because non-default features can be enabled by build commands and would leave the manifest with a latent unreviewed transport configuration. Reimplementing Cargo's transitive feature resolver in this Python gate was also rejected; the production client must instead add Cargo-owned resolved-feature evidence when its real graph exists.

## External basis

Cargo Reference, *Features* (Rust Project, current documentation accessed 2026-09-16): dependency features may be activated in `[features]` with `package-name/feature-name` or `package-name?/feature-name`, and enabled features for the same dependency are unified. https://doc.rust-lang.org/cargo/reference/features.html

Cargo Reference, *Dependency Resolution* (Rust Project, current documentation accessed 2026-09-16): lockfile resolution considers package features and compilation performs a second feature-selection pass; dependencies are built with the union of features enabled on them. https://doc.rust-lang.org/cargo/reference/resolver.html

## Claim boundary and next evidence

This repair closes root-manifest feature forwarding as an admission bypass. It does not prove that no future transitive package activates additional reqwest features. Before the production adapter can be called release-ready, the genuinely resolved standalone graph must demonstrate the actual reqwest feature set with Cargo-owned feature-graph evidence, alongside the existing lock provenance, rustls advisory, SBOM, dependency-review, platform CI, and real-network tests.
