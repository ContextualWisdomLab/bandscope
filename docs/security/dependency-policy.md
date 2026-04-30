# BandScope Dependency Policy

## Purpose

BandScope treats dependency checks, SBOM generation, and supply-chain security as bootstrap requirements, not later hardening work.

GitHub is the source of truth for code, CI/CD, code security, deployment, and releases.
Because of that, dependency review, security audit, SBOM generation, and supply-chain inventory are mandatory operating controls.

## Baseline controls

- commit the lockfile for every package ecosystem in use
- review dependency changes in PRs
- run dependency and vulnerability checks in GitHub Actions
- generate machine-readable SBOMs in CI
- upload SBOMs as GitHub Actions artifacts
- attach release-time SBOMs to GitHub Releases when a release exists
- track bundled binaries and model artifacts outside package-manager graphs
- keep dependency review, audit, inventory, and SBOM checks as required protected-branch merge gates
- require Windows and macOS build gates for protected-branch changes and release validation

## Covered supply-chain scope

- JavaScript and TypeScript workspace dependencies
- Python analysis engine dependencies
- Rust and Tauri crate dependencies
- GitHub Actions third-party actions
- bundled binaries such as `ffmpeg` and `yt-dlp`
- model files, weights, and sidecar assets

## Lockfile and pinning rules

- `package-lock.json` is required for the npm workspace
- `services/analysis-engine/uv.lock` is required for Python
- `apps/desktop/src-tauri/Cargo.lock` is required for Rust
- GitHub Actions must use commit-SHA pinned references where third-party actions are used
- mutable refs such as `latest`, `main`, `master`, or floating branch refs are not acceptable defaults
- unbounded version ranges, direct git refs, and postinstall download hacks require explicit rejection or documented exception review

## GitHub baseline

- Dependabot alerts are part of the required operating baseline
- Dependabot security updates are part of the required operating baseline
- dependency graph or dependency submission coverage must stay enabled wherever GitHub supports it for the repository state
- GitHub dependency review must gate PRs into `develop` and `main`
- GitHub Actions workflows that affect the supply chain must stay SHA pinned and least-privilege
- third-party actions require source-trust review, maintenance review, permission review, and commit-SHA pinning before admission

## New dependency admission rule

Any PR that adds a new direct dependency must record:

- why the dependency is needed
- whether it is runtime, build, test, or dev-only
- whether alternatives were considered
- whether the source is actively maintained and trustworthy
- whether the license is acceptable
- whether there are known security issues
- the approximate transitive footprint or supply-chain cost
- the BandScope-specific risk to public GitHub release and distribution flows

Use `.github/PULL_REQUEST_TEMPLATE.md` to capture this evidence.

## SBOM rule

- the baseline SBOM format is `CycloneDX JSON`
- SBOM generation must run in GitHub Actions on PRs or pushes and always on `main`, `develop`, and release-related events
- generated SBOMs must be uploaded as GitHub Actions artifacts
- release-time SBOMs must be retained with the GitHub Release when a Release exists
- bundled binaries and model artifacts must be tracked in `supply-chain/supplemental-component-inventory.json`
- ecosystem SBOM output and the supplemental inventory together must explain released desktop artifact contents
- release evidence should also retain checksums or equivalent integrity data for packaged artifacts when the release workflow emits them

## Gitflow enforcement intent

- `feature/* -> develop` PRs must pass dependency review and audit before merge
- `release/* -> main` PRs must pass dependency review, audit, and release-ready SBOM generation
- `hotfix/* -> main` PRs must not bypass dependency or SBOM controls
- `develop` keeps the same supply-chain baseline as `main`

## Evidence requirements

Every bootstrap, PR, or release report that claims this baseline is enforced must include:

- the workflow paths for dependency review, audit, and SBOM generation
- the required check names for `main` and `develop`
- the SBOM format used and where Actions artifacts or Release assets are retained
- the inventory path for bundled binaries and model artifacts
- the state of Dependabot alerts, Dependabot security updates, and dependency graph or dependency submission coverage
- any failed command or GitHub API call when enforcement could not be completed
- any remaining manual review item that still needs repository-admin action

## Vulnerability exception handling

Exceptions are allowed only when no patched version exists and the advisory is non-exploitable for this repository context.

- every exception must reference the exact advisory ID and reason
- every exception must document scope, exposure, and compensating controls
- exceptions must be encoded in repo-controlled workflow/config (not ad-hoc local commands)
- exceptions must be reviewed and removed once a patched version becomes available

Current controlled exceptions:

- No Python vulnerability exceptions are active. `GHSA-5239-wwwm-4pmq` (`Pygments <2.20.0`) was removed by locking `Pygments` to `2.20.0`; the CI `security-audit` workflow must run `pip-audit --local --strict` against the synced `uv` environment without a targeted ignore for that advisory.
- Cargo audit warnings for legacy `gtk3`, `glib`, and `fxhash` vulnerabilities (e.g. `RUSTSEC-2024-0413`, `RUSTSEC-2024-0429`, `RUSTSEC-2025-0057`) inherited through Tauri v2 `wry`/`webkit2gtk` integration are explicitly allowed. These are deep framework dependencies with no alternative, so they are documented exceptions and ignored by default.

Tracked third-party deprecation signal:

- `proc-macro-hack v0.5.20+deprecated` remains transitive through `tauri` / `tauri-build` -> `tauri-utils` -> `kuchikiki` -> `cssparser` -> `phf`. This is Cargo semver build metadata printed during dependency resolution, not a Rust compiler warning or an application runtime dependency. Do not suppress the output with broad quiet flags; remove it only through an upstream Tauri/html parsing dependency update that drops the `phf 0.10` owner chain.
- `RUSTSEC-2026-0097` for legacy `rand 0.7.3` remains transitive through `tauri` / `tauri-build` -> `tauri-utils` -> `kuchikiki 0.8.8-speedreader` -> `selectors 0.24.0` -> `phf_codegen 0.8.0` -> `phf_generator 0.8.0`. The repo-controlled Dependabot alert for `GHSA-cq8v-f236-94qc` is fixed by keeping the `rand 0.8` line on `0.8.6` or newer; the remaining `rand 0.7.3` advisory is an externally owned Tauri/kuchikiki build/transitive path with no compatible lockfile-only update available. Do not suppress it with broad quiet flags; remove it through an upstream Tauri/html parsing dependency update that drops the `phf 0.8` owner chain.
- Yanked `fastrand 2.4.0` was transiently inherited through target-specific `wry`/`dom_query` HTML parsing dependencies and must stay updated to `2.4.1` or newer in `apps/desktop/src-tauri/Cargo.lock`; `scripts/checks/verify_supply_chain.py` guards against reintroducing the yanked version.

## Required checks intent

The expected required status checks are documented in `docs/security/github-required-checks.md`.

Actual branch protection enforcement in GitHub is platform-level and must be applied with repository admin permissions.
Missing repo state should trigger bootstrap per `docs/workflow/github-bootstrap-execution-policy.md`; only missing permissions or platform limits should result in `BLOCKED`.

## Failure policy

Mark work as `FAILED` when repo-controlled baseline artifacts are missing or misconfigured, including:

- dependency review workflow
- audit workflow
- SBOM workflow
- lockfile coverage
- supplemental inventory for bundled binaries or model artifacts

Mark work as `BLOCKED` only when platform execution is impossible because GitHub admin context or platform capability is missing, including:

- required branch protection and status check enforcement when GitHub admin context is required but unavailable
- Dependabot or code security features that the current token or plan cannot enable
- Release asset or ruleset updates that cannot be applied because GitHub permissions are insufficient

## Fast reference

`모든 보호 브랜치 변경은 dependency review, 보안 점검, SBOM 생성·검증을 통과해야 하며, release 산출물은 GitHub에서 추적 가능한 SBOM과 함께 배포되고, 이 공급망 통제는 에이전트가 임의로 해제하지 않는다.`
