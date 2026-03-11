# ARCHITECTURE.md

Last updated: 2026-03-10

## Brand source

- Product identity, UX tone, copy rules, and prioritization tie-breakers live in `docs/brand-story.md`.
- Future PRDs, TRDs, onboarding copy, empty states, error messages, and marketing copy should use that document as the single brand source of truth.

## Security source

- App security rules, trust boundaries, and required `Security Notes` behavior live in `docs/security/app-security.md`.
- Future work that touches files, URLs, subprocesses, IPC, WebView, model downloads, updates, or cache/export behavior should reference that document before implementation.
- Code Security and SBOM retention baselines live in `docs/security/code-security.md` and `docs/security/sbom-policy.md`.

## Supply-chain source

- Dependency and SBOM policy lives in `docs/security/dependency-policy.md`.
- Intended required checks for `main` and `develop` live in `docs/security/github-required-checks.md`.

## Cross-platform build source

- Windows and macOS build security policy lives in `docs/security/cross-platform-build-policy.md`.
- Target-OS builds are merge gates and release-validation controls, not optional compatibility checks.

## GitHub bootstrap source

- GitHub bootstrap execution policy lives in `docs/workflow/github-bootstrap-execution-policy.md`.
- Repository governance and Gitflow execution details live in `docs/repository/governance.md`, `docs/repository/bootstrap-plan.md`, and `docs/repository/gitflow.md`.
- The harness should treat missing local git state or missing GitHub repo state as bootstrap work when the task requires GitHub execution.

## Cross-cutting security constraints

- Treat files, URLs, metadata, project files, model artifacts, exports, and remote responses as untrusted.
- Keep security-sensitive capabilities narrow and allowlisted rather than generic.
- Prefer local processing, predictable storage locations, and minimal network use.
- Split privilege where feasible across UI, analysis workers, subprocesses, model delivery, and updater behavior.
- Fail safely when a link, file, artifact, or boundary cannot be validated.

## Repository map

- `apps/desktop` - desktop shell and user-facing React UI
- `packages/shared-types` - stable cross-layer types shared by the UI and orchestration layer
- `services/analysis-engine` - Python analysis service for source separation and music analysis
- `scripts/harness` - fail-fast repo verification
- `scripts/checks` - small doc and structure checks

## Harness decisions

- The harness uses `npm` workspaces for JavaScript/TypeScript and `uv` for Python.
- The desktop app is scaffolded as `Tauri + Vite + React`, but initial verification keeps Rust packaging out of the default quickcheck path.
- The desktop shell uses an explicit Tauri CSP that only allows self-hosted assets, inline styles, Tauri IPC, and loopback development traffic.
- Mechanical gates focus on lint, typecheck, unit tests, coverage for Python, and documentation presence.
- Mechanical gates also enforce security document presence, plan `Security Notes`, and basic forbidden-pattern checks.
- Security context is part of architecture, not just implementation detail; docs and plans must record the trust boundary touched by risky changes.
- Supply-chain controls are part of the bootstrap architecture, not a release-afterthought.
- Dependency review, audit, supply-chain inventory validation, and SBOM generation are expected protected-branch gates for both `develop` and `main`.
- Cross-platform Windows and macOS build coverage is part of the bootstrap security architecture.
- GitHub-facing setup is staged: no-git -> local-git -> GitHub-connected -> protected-branches with required checks.
- Shared contracts live in `packages/shared-types` so the UI can evolve without importing Python internals.
- Product and UX decisions should prefer rehearsal-first simplicity while still maintaining high analytical accuracy.
- Security decisions should prefer allowlisted narrow capabilities over generic convenience APIs.

## Verification model

- `scripts/harness/quickcheck.sh` is the primary local verification entrypoint.
- `scripts/checks/check_rust.sh` is an opt-in local Rust/Tauri gate used when the host has the native desktop toolchain ready.
- CI mirrors the default sequence for JS and Python, and adds a dedicated macOS Rust check job.
- Smoke-grade app verification is currently the React shell render plus Python engine health report.
- Security docs and checks are part of the default quickcheck path so design drift is caught early.
- Supply-chain docs, workflow pinning, and lockfile verification are part of the default quickcheck path so dependency drift is caught early.
- Quickcheck and CI are expected to verify dependency review, audit, supplemental inventory, and SBOM baseline presence as part of bootstrap.
- Cross-platform build workflow presence and trigger coverage are part of the default supply-chain verification path.
