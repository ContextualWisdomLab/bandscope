# Rust toolchain freshness and reproducibility

## Decision

BandScope pins Rust `1.97.1` as the repository build compiler. The root
`rust-toolchain.toml`, product CI, release preflight, dependency audit, and
Windows/macOS amd64/arm64 packaging workflows all use that exact point release.
A floating `stable` selector is not accepted because it can change scientific,
security, and release evidence without a repository diff.

The compiler pin does not add or raise `package.rust-version` in the workspace.
This change governs BandScope's reviewed build environment; it does not create a
new downstream minimum-supported-Rust promise for reusable crates.

GitHub Dependabot monitors the root manifest through the `rust-toolchain`
ecosystem against the protected `develop` branch. A future compiler update must
therefore arrive as a reviewable pull request and pass the unchanged-head
Windows, macOS, analysis-engine, Tauri, release-preflight, audit, coverage, and
supply-chain gates.

`scripts/checks/verify_rust_toolchain.py` runs in the canonical quickcheck and
fails when any executable workflow reintroduces `rustup toolchain install
stable`, `cargo +stable`, or `--toolchain stable`.

## References

GitHub. (2026). *Dependabot supports updates for Rust toolchains*. GitHub
Changelog. https://github.blog/changelog/

The Rust Release Team. (2026, July 16). *Announcing Rust 1.97.1*. Rust Blog.
https://blog.rust-lang.org/2026/07/16/Rust-1.97.1/
