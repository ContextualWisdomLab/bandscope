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
- track lock-managed auxiliary tools, operator-provided executables, bundled binaries, and model
  artifacts when ecosystem SBOMs alone do not prove runtime identity
- keep dependency review, audit, inventory, and SBOM checks as required protected-branch merge gates
- require Windows and macOS build gates for protected-branch changes and release validation

## Covered supply-chain scope

- JavaScript and TypeScript workspace dependencies
- Python analysis engine dependencies
- Rust and Tauri crate dependencies
- GitHub Actions third-party actions
- lock-managed auxiliary tools such as yt-dlp
- operator-provided, non-bundled executables such as ffmpeg and ffprobe
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
- Cargo audit warnings for legacy `gtk3` vulnerabilities (e.g. `RUSTSEC-2024-0413`) inherited through Tauri v2 `wry`/`webkit2gtk` integration are explicitly allowed. These are deep framework dependencies with no alternative, so they are documented exceptions and ignored by default.
- `RUSTSEC-2024-0429` / `GHSA-wrw7-89jp-8q8g` for `glib 0.18.5` is allowed only for the `VariantStrIter` advisory inherited through the Tauri/wry/webkit2gtk/gtk GTK3 stack. A compatible lockfile refresh can move the desktop stack to `tauri 2.11.4`, `wry 0.55.1`, `tao 0.35.3`, `muda 0.19.3`, and related transitive patches, but it still does not move this stack to patched `glib >=0.20.0`; as of 2026-07-11, crates.io metadata for `tauri 2.11.5`, `tauri-runtime-wry 2.11.4`, `wry 0.55.1`, `webkit2gtk 2.0.2`, and `gtk 0.18.2` still keeps Linux on `gtk ^0.18` / `glib ^0.18`. Cargo target-tree evidence shows this Linux GTK stack is absent from the Windows and macOS artifacts BandScope ships. The exception must remain encoded in repo-controlled cargo-audit, OSV, and Trivy configuration, must carry a Trivy expiry/revisit date, is guarded by `scripts/checks/verify_supply_chain.py`, and must be removed when upstream drops or patches the chain.
- `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195` for `quick-xml 0.39.4` are allowed only while the current compatible upstream owner chains still require vulnerable `quick-xml`: `plist 1.9.0` through Tauri, and `wayland-scanner 0.31.10` through Linux `rfd`/Wayland dependencies. `quick-xml >=0.41.0` is patched, but `plist 1.9.0` requires `quick-xml ^0.39.2` and the current `wayland-scanner` release also has no compatible patched path. BandScope does not expose either owner chain as a user-controlled XML ingestion surface; the exception must stay encoded in repo-controlled cargo-audit and OSV configuration, and must be removed once compatible upstream crates publish a patched dependency path.

Retired third-party deprecation and advisory signal:

- `proc-macro-hack v0.5.20+deprecated`, `RUSTSEC-2025-0057` for `fxhash`, and `RUSTSEC-2026-0097` for legacy `rand 0.7.3` were removed by a compatible Tauri lockfile refresh that moved `tauri` to `2.11.0` and `tauri-utils` to `2.9.0`, dropping the `kuchikiki`/`selectors`/`phf 0.8` owner chain. Do not reintroduce this chain or restore the `RUSTSEC-2026-0097` Cargo audit exception; `scripts/checks/verify_supply_chain.py` rejects any future `rand 0.7.x` lockfile entry.
- The former `GHSA-53q9-r3pm-6pq6` exception for torch 2.2.2 is retired. The current lock resolves
  torch 2.12.1 on supported Linux and the Demucs dependency marker excludes macOS Intel rather than
  retaining the vulnerable torch build. No repo-local dependency-review allowlist or analysis-engine
  OSV exception for that advisory is active. Do not restore either stale exception. Separately,
  ADR-0001 requires full-SHA verification of the exact htdemucs artifact before any torch checkpoint
  deserialization, then `weights_only=True`, the exact reviewed global allowlist, strict model
  construction, and serialized loading. Any model hash, allowlist, torch, NumPy, or Demucs lock
  change requires the exact-artifact smoke test before it can qualify as release-ready.
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
