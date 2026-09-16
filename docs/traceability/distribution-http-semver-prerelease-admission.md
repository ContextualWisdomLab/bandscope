# Distribution HTTP SemVer pre-release admission traceability

Status: implemented owner-policy repair; production HTTP adapter remains pending.

## Problem

`RUSTSEC-2026-0285` marks `rustls >=0.23.13,<0.23.45` as affected and stable `rustls >=0.23.45` as patched. The Distribution dependency gate previously reduced every lockfile version to its numeric `MAJOR.MINOR.PATCH` core before comparing advisory boundaries. That made `0.23.45-alpha.1` or `0.23.45-rc.1` compare as if it were the patched stable `0.23.45`, even though SemVer orders a pre-release below the corresponding normal release.

The same numeric-core projection treated a hypothetical locked `reqwest 0.13.5-alpha.1` as if it belonged to the owner-reviewed stable `0.13.5+` line. The production manifest still rejects pre-release requirements, but the lockfile gate is security evidence in its own right and must not mislabel pre-release packages as reviewed stable releases.

## Constraints and decision

- Keep the manifest owner contract unchanged: direct reqwest must use the canonical three-component stable requirement form such as `0.13.5`.
- Preserve build metadata as precedence-neutral for lockfile range decisions, consistent with SemVer/Cargo behavior.
- Reject reqwest pre-releases from the reviewed stable 0.13 line.
- Compare the RustSec interval against stable boundaries: a pre-release at `0.23.13` is below the advisory's stable lower bound, while a pre-release at `0.23.45` is still below the first stable patched release and therefore remains inside the affected interval when it is otherwise at or above the affected floor.
- Do not broaden this small checker into a general package resolver. Cargo remains the dependency-resolution authority; this gate only models the owner ranges it explicitly claims.

## RED -> repair evidence

- `dbe79884db3ba93db082688994beb140b8d58aad` adds regression contracts requiring locked `reqwest 0.13.5-alpha.1` to fail the reviewed-stable-line check and `rustls 0.23.45-alpha.1` / `0.23.45-rc.1` to remain rejected under `RUSTSEC-2026-0285`. Stable `rustls 0.23.45` remains admitted. The RED was committed before the causal checker change; it is not claimed as a separately hosted failing run.
- `98a53d6fed8fe89b28a9e22b9c9c0d7c417d8072` preserves pre-release presence while parsing lock versions, rejects reqwest pre-releases from the reviewed stable line, and evaluates the RustSec stable lower/upper boundaries without promoting `0.23.45-*` to patched status.
- `269bd4a72b5bcbd4e76b9174b272fd5aa14772e9` aligns the reqwest pre-release regression with the checker's stable-line diagnostic after the causal fix, without changing the production policy.

## Claim boundary

These synthetic Cargo fixtures prove the repository policy function only. They do not prove that a production HTTP client exists, that a given rustls version is reachable in a built binary, or that real TLS/network behavior has passed acceptance. Production evidence still requires a BandScope-owned standalone lock, exact-head dependency review/SBOM/security checks, platform builds, and real network/fault tests once the adapter is implemented.

## References

Rust Secure Code Working Group. (2026, September 14). *RUSTSEC-2026-0285: rustls: TLS 1.3 handshake messages incorrectly accepted across encryption level boundaries*. RustSec Advisory Database. https://rustsec.org/advisories/RUSTSEC-2026-0285.html

The Rust Project Developers. (2026). *The manifest format*. The Cargo Book. https://doc.rust-lang.org/cargo/reference/manifest.html
