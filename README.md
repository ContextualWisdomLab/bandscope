# BandScope

BandScope is a public GitHub project for a local-first desktop app that turns a song into a practical rehearsal view: likely harmony by section and by instrument or vocal role, section roadmap, tempo and groove cues, separated stems, playable ranges, simplification hints, transposition or capo guidance, overlap cues, visible confidence, and rehearsal priorities without DAW complexity.

It does not promise notation-grade full arrangement transcription or DAW-style production editing.

Brand and product voice source of truth: `docs/brand-story.md`
App security source of truth: `docs/security/app-security.md`
Dependency and SBOM source of truth: `docs/security/dependency-policy.md`
Cross-platform build policy source of truth: `docs/security/cross-platform-build-policy.md`
GitHub bootstrap execution source of truth: `docs/workflow/github-bootstrap-execution-policy.md`

## Public repository baseline

- GitHub is the source of truth for review, CI/CD, release distribution, Code Security, dependency review, and SBOM retention.
- Gitflow is the default branch strategy. Read `docs/repository/gitflow.md`.
- Contribution entrypoint: `CONTRIBUTING.md`
- Governance baseline: `docs/repository/governance.md`
- Security and reporting baseline: `SECURITY.md`

## Security quick start

Read these before proposing PRDs, TRDs, UX copy, architecture changes, or implementation details:

- `docs/brand-story.md`
- `docs/security/app-security.md`
- `docs/security/dependency-policy.md`
- `docs/security/cross-platform-build-policy.md`
- `docs/workflow/github-bootstrap-execution-policy.md`
- `docs/repository/bootstrap-plan.md`
- `docs/security/code-security.md`
- `docs/security/sbom-policy.md`
- `ARCHITECTURE.md`
- `docs/plans/2026-03-10-bandscope-harness.md`

If a change touches files, URLs, subprocesses, IPC, WebView, model loading, updates, cache, logs, telemetry, or export behavior, include `Security Notes` and keep the design aligned with narrow allowlists, untrusted-input handling, and safe failure.
If a change adds or updates dependencies, Actions, bundled binaries, or model artifacts, keep it aligned with lockfile, dependency-review, audit, and SBOM policy.
If a change affects build, packaging, release, updater, bundled assets, or target-OS behavior, keep it aligned with the mandatory Windows and macOS build policy.
If GitHub-specific execution is required and no repo exists yet, treat that as bootstrap work rather than a default blocker.

## Current Status

The core implementation backlog (Issue #26) has been successfully completed. BandScope now features a functioning local-first workflow, including audio intake, Python-based offline analysis, section/role extraction, manual user overrides, and CSV/JSON cue-sheet exports. The repository maintains 100% measured test coverage and 100% measured docstring coverage for the `services/analysis-engine` package and `apps/desktop` frontend components. 

## Workspace layout

- `apps/desktop` - Tauri + React desktop shell
- `packages/shared-types` - shared TypeScript contracts
- `services/analysis-engine` - Python analysis engine
- `scripts/harness` - reproducible verification entrypoints
- `docs/` - architecture, plans, and testing notes

## Setup

### Desktop prerequisites

- Rust stable toolchain for the Tauri shell
- macOS: Xcode command line tools and accepted Xcode license (`sudo xcodebuild -license`)
- Windows: MSVC build tools

### Node

```bash
npm install
```

### Python

```bash
uv sync --project services/analysis-engine --group dev
```

## Verification

```bash
./scripts/harness/quickcheck.sh
```

Optional Rust/Tauri lane:

```bash
BANDSCOPE_ENABLE_RUST_CHECK=1 ./scripts/harness/quickcheck.sh
```

## Goals of this harness

- make the repository bootstrappable on a clean machine
- keep frontend and Python engine contracts explicit
- keep rehearsal-domain outputs explicit across sections, roles, cues, confidence, and exports
- enforce mechanical checks early
- keep docs visible to future agents
- keep brand, product voice, and UX tone consistent through repo docs
- keep security rules visible and mechanically enforced for future agents
