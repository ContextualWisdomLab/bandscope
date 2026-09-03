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
ecosystem against the protected `develop` branch. GitHub documents this
integration as a Dependabot version-update capability rather than a Rust
security-update feed. A future compiler update must therefore arrive as a
reviewable pull request and pass the unchanged-head Windows, macOS,
analysis-engine, Tauri, release-preflight, audit, coverage, and supply-chain
gates. GitHub's platform-level default cooldown for Dependabot version updates
is additional noise control; it is not treated as a repository security or
freshness guarantee.

`scripts/checks/verify_rust_toolchain.py` runs in the canonical quickcheck and
fails when any executable workflow reintroduces `rustup toolchain install
stable`, `cargo +stable`, or `--toolchain stable`. The same guard binds
`directory`, target branch, and schedule evidence to the actual
`rust-toolchain` Dependabot lane so an unrelated ecosystem entry cannot satisfy
the compiler-update policy.

Required Rust command evidence is also bound to one inline executable `run:`
step whose exit status cannot be replaced by shell chaining, pipelines, or
background control operators. Arguments such as `--manifest-path`, `--locked`,
and an explicit target triple remain valid, but forms such as `|| true`,
`| cat`, or `; true` fail closed. This prevents an unsuccessfully installed,
checked, tested, or audited Rust toolchain from becoming success-shaped policy
evidence merely because a later shell command returns zero.

## References

GitHub. (2025, August 19). *Dependabot now supports Rust toolchain updates*.
GitHub Changelog.
https://github.blog/changelog/2025-08-19-dependabot-now-supports-rust-toolchain-updates/

GitHub. (2026, July 14). *Dependabot version updates introduce default package
cooldown*. GitHub Changelog.
https://github.blog/changelog/2026-07-14-dependabot-version-updates-introduce-default-package-cooldown/

The Rust Release Team. (2026, July 16). *Announcing Rust 1.97.1*. Rust Blog.
https://blog.rust-lang.org/2026/07/16/Rust-1.97.1/
