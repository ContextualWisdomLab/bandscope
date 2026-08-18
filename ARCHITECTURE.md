# ARCHITECTURE.md

Last updated: 2026-08-10

## Documentation authority

- Product requirements live in `docs/PRD.md`.
- Technical requirements live in `docs/TRD.md`.
- Decision status and supersession live in `docs/adr/README.md`.
- Component, UML, deployment, and logical artifact views live in
  `docs/architecture/diagrams.md`.
- Sufficiency and requirement-to-evidence traceability live in
  `docs/documentation-coverage-matrix.md`.

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

## Engineering acceptance and workflow source

- Repository completion criteria live in `docs/engineering/acceptance-criteria.md`.
- Harness/runtime verification guidance lives in `docs/engineering/harness-engineering.md`.
- Canonical delivery flow lives in `docs/workflow/one-day-delivery-plan.md`.
- PR canonicalization and duplicate-handling policy lives in `docs/workflow/pr-continuity.md`.

## Agent and review operations source

- Agent/subagent/skill usage baseline lives in `docs/agents/README.md`.
- CodeRabbit command and review handling baseline lives in `docs/coderabbit/review-commands.md`.

## Deployment and runtime verification source

- Deployment/release/runtime verification runbook lives in `docs/operations/deploy-runbook.md`.

## Cross-platform build source

- Windows and macOS build security policy lives in `docs/security/cross-platform-build-policy.md`.
- Target-OS builds are merge gates and release-validation controls, not optional compatibility checks.
- Windows amd64 + arm64 and macOS amd64 + arm64 are all part of the protected-branch and release-validation build baseline.
- Windows build runners should verify antivirus protection before native packaging begins.

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

## Product capability scope

- BandScope is not only a shell around chord labels, stems, and ranges.
- The technical scope includes rehearsal-facing outputs for harmony, section roadmap, groove cues, role entry and dropout cues, simplification guidance, transposition or setup guidance, confidence flags, and rehearsal priority.
- These outputs must stay aligned with `docs/brand-story.md` rather than drifting back to a song-summary-only analyzer.

## Analysis target model

- The analysis target is a `song -> section -> role` hierarchy, not a single song-wide chord track.
- A `role` can represent an instrument, a vocal function, or a hand-specific subdivision when the arrangement exposes it clearly.
- Typical roles include bass, guitar, keyboard players, keyboard left hand, keyboard right hand, lead vocal, backing vocal, horns, strings, and other arrangement-carrying parts.
- Shared contracts should be able to carry different harmonic guidance for simultaneous roles in the same section.

## Source separation and model delivery

- Production separation uses Demucs 4.0.1 `htdemucs` and returns exactly vocals, bass, drums, and
  other for downstream local analysis. The retired `bandsplit-v1` profile is not a production
  model.
- Demucs random temporal shifts are disabled (`shifts=0`) so the same bytes and model produce
  reproducible local analysis and benchmark evidence.
- Model inference is local and fail-closed. A trusted provisioning step must place the exact
  official weight artifact in a user-scoped cache before runtime; a missing artifact is never
  fetched by the separator. The repository and release artifacts do not bundle the weights.
- The exact signature, source URL, full SHA-256, byte size, distribution status, and model-rights
  uncertainty are tracked in `supply-chain/supplemental-component-inventory.json` and ADR-0001.
- The separator verifies a non-symlinked regular file's exact byte size and full SHA-256, then
  passes those same verified bytes through PyTorch's `weights_only=True` restricted loader with an
  exact reviewed global allowlist, strict model construction, and a serialized one-time cache. A
  future artifact hash or allowlist change is executable-code review; model-rights/legal delivery
  also remains a release blocker. The repository security owner must separately accept the residual
  approved-pickle risk for the exact model hash/dependency lock, with expiry/re-review and rollback,
  or approve a non-pickle replacement.
- Current dependency markers exclude Demucs on macOS Intel; unsupported platforms must surface the
  existing safe fallback rather than pretending to separate stems.
- Quality claims are platform-scoped: every advertised OS/architecture needs an unchanged-candidate
  pass, while every unproven artifact must exercise and advertise the fallback.

## Known-stem validation boundary

- The active known-stem branch crosses the production YouTube downloader and production separator,
  while its reference loader, alignment, and metric utilities remain test-only.
- It pins a creator-published vocal source and a separate finished master by exact hosts, byte
  counts, full SHA-256 values, member, and member size; downloads and waveforms stay in test-owned
  ephemeral storage.
- The finished master proves candidate identity. YouTube-to-master and master-to-vocal global lags
  are composed once before separation; predicted stems are never realigned. Quality requires
  duration/identity checks, zero-mean SI-SDR improvement over the downloaded mixture. SI-SDR remains
  the primary separation score (Le Roux et al., 2019). Harmony uses Odekerken/MIREX WCSR. Beat/onset
  F-measure stays inside Chiu et al. (2025) ±70 ms. Tempo requires Schreiber, Urbano, & Müller
  (2020) Acc1 and Acc2 together; Acc2 alone is forbidden, and Raffel (2014) is not an Acc1/Acc2
  source. This branch also requires correct
  vocal-stem assignment margin.
- Deterministic metric/integrity/security contracts run in ordinary CI. Live network/model execution
  is explicit opt-in and cannot be scheduled or made release-blocking until authorization and
  calibration requirements in ADR-0002 are met.
- The capability has no relational persistence. ADR-0003 and the logical artifact model in
  `docs/architecture/diagrams.md` are authoritative instead of a physical ERD.
- The planned `BenchmarkRun`/`BenchmarkEvidence` aggregate always binds candidate, fixture, model,
  and sanitized toolchain provenance; identity and score blocks are stage-dependent. Persistence is
  disabled until store/access/TTL/deletion controls are accepted.
- Distinct user-facing import/model/decode/separation recovery states are planned under
  PRD-KS-011/TRD-KS-013; the current benchmark failure taxonomy does not claim that product UX is
  complete.

## Rehearsal outputs

- Core rehearsal artifacts should include:
  - likely harmony by section and by role
  - section roadmap with entries, dropouts, pickups, stops, tags, and handoffs
  - groove and timing cues relevant to locking the band together
  - playable ranges and density or overlap warnings
  - simplification, transposition, capo, tuning, or setup cues where applicable
  - role-specific rehearsal priorities and confidence flags
  - cue-sheet or chart-style exports that summarize the analysis in rehearsal-friendly form

## Confidence, edits, and provenance

- Confidence must be representable at the section and role level.
- Automatic analysis should remain editable without losing provenance of what was model-generated versus user-confirmed.
- Future shared contracts should preserve manual overrides, confidence markers, and export-safe summaries of those states.

## Harness decisions

- The harness uses `npm` workspaces for JavaScript/TypeScript and `uv` for Python.
- The desktop app is scaffolded as `Tauri + Vite + React`, but initial verification keeps Rust packaging out of the default quickcheck path.
- The desktop shell uses an explicit Tauri CSP that only allows self-hosted assets, inline styles, Tauri IPC, and loopback development traffic.
- Mechanical gates focus on lint, typecheck, unit tests, coverage for Python, and documentation presence.
- Python quality gates also require 100% docstring coverage via `package.json` script `check:python-docstrings`, enforced with Ruff rules `D100` through `D107` across tracked packages, modules, classes, nested classes, functions, methods (including `__init__`), `services/analysis-engine` tests, and repo-owned Python scripts.
- Mechanical gates also enforce security document presence, plan `Security Notes`, and basic forbidden-pattern checks.
- Security context is part of architecture, not just implementation detail; docs and plans must record the trust boundary touched by risky changes.
- Supply-chain controls are part of the bootstrap architecture, not a release-afterthought.
- Dependency review, audit, supply-chain inventory validation, and SBOM generation are expected protected-branch gates for both `develop` and `main`.
- Cross-platform Windows and macOS build coverage is part of the bootstrap security architecture.
- Release artifacts, checksums, and manifests should encode both OS and architecture so packaged binaries remain traceable.
- Exact Windows 10 and macOS 24/25 GitHub-hosted coverage is a platform-capability constraint today; the current hosted baseline uses the closest published explicit runner labels and must move to self-hosted or larger runners if exact-version enforcement becomes mandatory.
- GitHub-facing setup is staged: no-git -> local-git -> GitHub-connected -> protected-branches with required checks.
- Shared contracts live in `packages/shared-types` so the UI can evolve without importing Python internals.
- Shared contracts should ultimately model section, role, cue, confidence, and export artifacts explicitly enough that desktop UI and analysis outputs do not invent their own parallel schemas.
- The current shared-types baseline includes a rehearsal-domain fixture that exercises section, role, cue, confidence, provenance, and export-summary fields in the desktop shell before the full analysis pipeline lands.
- Local analysis orchestration uses typed Tauri IPC commands and a Python subprocess over stdin/stdout rather than a loopback HTTP listener.
- Local audio intake bootstraps a project by validating a user-selected file in Rust, creating app-owned temp/cache/project roots, and referencing the original source file rather than copying it in this phase.
- Those bootstrap roots should resolve from app-owned Tauri data/cache paths instead of the shared system temp namespace.
- Product and UX decisions should prefer rehearsal-first simplicity while still maintaining high analytical accuracy.
- Security decisions should prefer allowlisted narrow capabilities over generic convenience APIs.

## Verification model

- `scripts/harness/quickcheck.sh` is the primary local verification entrypoint.
- `scripts/checks/check_rust.sh` is an opt-in local Rust/Tauri gate used when the host has the native desktop toolchain ready.
- CI mirrors the default sequence for JS and Python, and adds dedicated Windows/macOS native build coverage for both amd64 and arm64 runners.
- Smoke-grade app verification is currently the React shell render plus Python engine health report.
- Security docs and checks are part of the default quickcheck path so design drift is caught early.
- Supply-chain docs, workflow pinning, and lockfile verification are part of the default quickcheck path so dependency drift is caught early.
- Quickcheck and CI are expected to verify dependency review, audit, supplemental inventory, and SBOM baseline presence as part of bootstrap.
- Cross-platform build workflow presence and trigger coverage are part of the default supply-chain verification path.
