# AGENTS.md

## Project overview
- BandScope is a local-first desktop app for chord, stem, and range analysis.
- Authoritative delivery rules live in `docs/ARCHITECTURE.md`, `docs/plans/`, and the root verification scripts.
- Brand, tone, UX copy, and prioritization rules live in `docs/brand-story.md` and must be applied to PRDs, TRDs, UI copy, onboarding, empty states, and error messages.
- App security rules live in `docs/security/app-security.md` and must be applied to file handling, URL intake, subprocesses, IPC, WebView usage, model loading, updates, logging, cache handling, and export behavior.
- Dependency, SBOM, and supply-chain rules live in `docs/security/dependency-policy.md` and must be applied to dependency additions, GitHub Actions, releases, bundled binaries, and model artifacts.
- Code Security rules live in `docs/security/code-security.md` and must be applied to CodeQL, dependency review, secret scanning, Dependabot, and GitHub security feature baselines.
- Cross-platform build security rules live in `docs/security/cross-platform-build-policy.md` and must be applied to CI, release validation, protected-branch checks, packaging, and artifact handling.
- GitHub bootstrap execution rules live in `docs/workflow/github-bootstrap-execution-policy.md` and must be applied whenever the task involves repository creation, branch setup, branch protection, PRs, required checks, or GitHub security configuration.
- Repository governance and Gitflow rules live in `docs/repository/governance.md`, `docs/repository/bootstrap-plan.md`, and `docs/repository/gitflow.md`.

## Security workflow
- Before writing PRDs, TRDs, UX copy, architecture changes, or implementation plans that touch risky boundaries, read `docs/security/app-security.md`.
- If a task touches files, URLs, subprocesses, ffmpeg or native tools, WebView, local backend or IPC, updates, model downloads, project formats, logs, telemetry, or exports, the result must include `Security Notes`.
- `Security Notes` should cover untrusted inputs, trust boundaries, allowlists or validation, safe failure, logging/privacy impact, and test points.

## Supply chain workflow
- Before adding or changing dependencies, GitHub Actions, bundled binaries, or model artifacts, read `docs/security/dependency-policy.md`.
- New direct dependencies must include admission rationale covering purpose, dependency class, alternatives, maintainer trust, license fit, known security issues, transitive footprint, and BandScope release risk.
- Lockfiles, dependency review, audit, SBOM generation, and supplemental component inventory are mandatory and must not be skipped or loosened.
- Supply-chain work is not complete without evidence: workflow paths, required check names for `main` and `develop`, SBOM format and retention, Dependabot baseline state, and the bundled-binary/model inventory path.
- Use `FAILED` when repo-controlled supply-chain artifacts are missing; use `BLOCKED` only when GitHub permission, auth, network, or platform capability prevents enforcement.

## Cross-platform build workflow
- Before changing CI, packaging, release flows, or native desktop build settings, read `docs/security/cross-platform-build-policy.md`.
- Windows and macOS builds are required security controls for `develop`, `main`, and release validation.
- Protected-branch build checks for Windows and macOS must not be removed, downgraded, or treated as optional.

## GitHub bootstrap workflow
- Before declaring a GitHub task blocked, read `docs/workflow/github-bootstrap-execution-policy.md`.
- Missing local git state, missing GitHub repo, missing `main`, missing `develop`, or missing initial workflows are bootstrap conditions, not default blockers.
- For GitHub tasks, only use `BLOCKED` when the failure is caused by missing GitHub permissions, missing auth, missing network access, or platform-level feature limits.

## Setup commands
- Node: `npm install`
- Python: `uv sync --project services/analysis-engine --group dev`

## Build / Test commands
- Full harness check: `./scripts/harness/quickcheck.sh`
- Frontend tests: `npm run test --workspaces --if-present`
- Python tests: `uv run --project services/analysis-engine pytest --cov=src/bandscope_analysis --cov-report=term-missing --cov-fail-under=100`
- Typecheck: `npm run typecheck --workspaces --if-present && uv run --project services/analysis-engine mypy src`

## Architecture references
- `ARCHITECTURE.md`
- `docs/brand-story.md`
- `docs/security/app-security.md`
- `docs/security/dependency-policy.md`
- `docs/security/cross-platform-build-policy.md`
- `docs/workflow/github-bootstrap-execution-policy.md`
- `docs/security/github-required-checks.md`
- `docs/plans/2026-03-10-bandscope-harness-design.md`
- `docs/plans/2026-03-10-bandscope-harness.md`

## Code style
- Keep UI and analysis engine decoupled through shared contracts.
- Prefer minimal, test-first changes for production code.
- Prefer practical, friendly, rehearsal-first wording over academic or authority-heavy language.
- Do not frame usability as a reason to accept weak analysis quality; BandScope should aim for both easy use and high accuracy.

## Safety
- Do not add network-dependent runtime paths for local analysis.
- Treat YouTube import as policy-constrained and fallback-friendly.
- Treat files, URLs, metadata, model artifacts, and project files as untrusted input.
- Do not add generic exec/read/write APIs.
- Use `shell=False`-style subprocess invocation with argument arrays only.
- Keep local backend access on allowlisted IPC or `127.0.0.1` only, with strict schema validation.
- When a change touches files, URLs, subprocesses, IPC, WebView, updates, or model downloads, include `Security Notes`.
- Prefer narrower allowlists over stronger but more generic capabilities.
- Do not justify risky debug defaults as temporary shortcuts.
- Do not defer dependency review, SBOM generation, or supply-chain checks to a later phase.
- Do not defer Windows or macOS build enforcement to a later phase.
