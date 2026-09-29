# Distribution HTTP reqwest version-line admission traceability

Status: source-level dependency admission repaired; production HTTP adapter and exact hosted evidence remain pending.

## Problem

BandScope's Distribution HTTP admission already required a bounded three-component reqwest requirement, the explicit `rustls` feature, canonical crates.io provenance, and a standalone lock without the `RUSTSEC-2026-0285` rustls affected interval. Fresh review found that the version rule still accepted any syntactically valid three-component reqwest release. `0.13.4` and a future SemVer-incompatible `0.14.0` therefore satisfied the checker even though the transport threat analysis, feature inventory, builder API assumptions, and dependency rationale were reviewed against reqwest 0.13.5.

That is a policy gap rather than a Cargo parsing bug. A three-component requirement such as `0.14.0` is bounded, but it does not preserve the version line whose behavior BandScope actually reviewed. A downgrade to 0.13.4 likewise moves below the reviewed dependency baseline without a new owner decision. The committed lock is still the exact resolved graph, but the pre-compilation owner gate must reject a manifest or lock graph that silently crosses the reviewed boundary.

The timing of `RUSTSEC-2026-0285` makes the distinction concrete. Reqwest 0.13.5 was published before rustls 0.23.45. The reqwest 0.13.5 docs.rs source snapshot contains rustls 0.23.44 in its own development lock, while RustSec marks `rustls >=0.23.13,<0.23.45` affected and 0.23.45 patched. That upstream lock is not BandScope's downstream resolution and is not vulnerability evidence for BandScope by itself; it shows why the BandScope-owned standalone lock, rather than an upstream release label, must carry the patched runtime graph.

## Constraints

- The currently reviewed reqwest line is `>=0.13.5,<0.14.0`.
- A direct runtime reqwest manifest requirement must remain a canonical three-component Cargo requirement and must fall inside that reviewed line.
- Every reqwest package resolved in `apps/desktop/distribution-transport/Cargo.lock` must also remain inside the reviewed line. A stale safe-looking 0.13 entry must not mask a second unreviewed reqwest release in the same standalone graph.
- A later 0.13.x patch may enter through the normal lock-refresh path because it remains in the reviewed SemVer line and still passes feature, provenance, rustls-advisory, dependency-review, OSV, SBOM and hosted platform gates.
- Any downgrade below 0.13.5 or move to 0.14+ requires a new Distribution owner decision, dependency admission evidence, API/feature review, threat analysis and exact-head tests before the allowed range is changed.
- This rule does not pin reqwest to exactly 0.13.5. The manifest requirement and committed lock retain their separate roles: the manifest constrains the reviewed compatible line; the lock records the exact build graph.
- The production client still must explicitly select `tls_backend_rustls()`, disable redirects, transparent decoding and proxy inheritance, and pass exact response evidence into `distribution-transport`. Version-line admission is not a substitute for runtime configuration.

## RED -> causal fix

- RED `106e03ab954c2bb21a0c127da187a07a17c2b505` adds regression cases for a downgrade to reqwest 0.13.4 and a SemVer-line move to 0.14.0. The predecessor checker accepted both because it validated only three-component syntax.
- Causal fix `13be2643220bf66ccff6482576ea9c5db01186b1` adds the reviewed range `>=0.13.5,<0.14.0` to both direct declaration admission and every resolved reqwest lock entry. The existing crates.io-source, exact `{rustls}` feature, workspace/alias/target-scope, and rustls advisory checks remain unchanged.
- A 0.13.6 fixture remains admissible under the helper semantics, so this repair does not convert the binary product lock into an exact patch pin.

## Alternatives considered

Exact-pinning reqwest to `=0.13.5` was rejected. BandScope already commits the standalone Cargo lock, and an exact manifest pin would duplicate that authority while making ordinary compatible security/bug-fix refreshes require a source-policy edit.

Allowing any three-component reqwest version was rejected. The checker would then treat a SemVer-incompatible line as equivalent to the API and feature surface actually reviewed for the updater transport.

Checking only the manifest and ignoring resolved reqwest versions was rejected. Cargo can carry multiple versions of the same package in one lock graph; the release-security owner must not let an admitted 0.13 entry conceal another reqwest line in the same standalone transport graph.

Automatically widening the allowed range when crates.io publishes a new reqwest line was rejected. Dependency publication is external supply-chain input, not a BandScope architecture decision.

## Claim boundary

This repair prevents the current pre-compilation admission gate from silently accepting an unreviewed reqwest downgrade or SemVer-line change. It does not prove that reqwest 0.13.5 is vulnerability-free, that the future production HTTP adapter is correctly configured, or that the exact current branch has hosted GREEN evidence. The actual adapter must still arrive with a committed resolved lock that selects unaffected rustls, then pass dependency review, OSV/Trivy, SBOM, Windows/macOS/Linux Distribution tests and the subsequent real-network/fault acceptance path.

## Follow-up

Implement the production HTTP adapter only after generating a real standalone lock for the reviewed reqwest 0.13.x line with unaffected rustls. Do not copy reqwest's upstream development lock: BandScope must resolve and commit its own dependency graph. Then verify explicit rustls backend selection, no implicit redirect/decompression/proxy behavior, bounded chunk streaming, cancellation, DNS/TLS/network errors, disk-full behavior and captive-portal/non-release responses before moving to authenticated metadata and sealed-artifact cryptographic promotion.

## References

Reqwest project. (2026). *reqwest 0.13.5: Cargo.toml and feature configuration*. Docs.rs. https://docs.rs/crate/reqwest/0.13.5/source/Cargo.toml.orig

Reqwest project. (2026). *reqwest 0.13.5: TLS configuration and types*. Docs.rs. https://docs.rs/reqwest/0.13.5/reqwest/tls/

Rust Project. (2026). *Dependency resolution: Version requirements*. The Cargo Book. https://doc.rust-lang.org/cargo/reference/resolver.html#version-numbers

RustSec. (2026, September 14). *RUSTSEC-2026-0285: rustls: TLS 1.3 handshake messages incorrectly accepted across encryption level boundaries*. RustSec Advisory Database. https://rustsec.org/advisories/RUSTSEC-2026-0285.html
