# BandScope

BandScope is a local-first desktop rehearsal assistant that turns a song into a practical rehearsal map: section-aware harmony, role-specific cues, tempo and groove guidance, rough stem previews, playable ranges, simplification and transposition hints, confidence, and rehearsal priorities without DAW complexity.

[Ask DeepWiki](https://deepwiki.com/ContextualWisdomLab/bandscope)

## Start here

- [Repository README](https://github.com/ContextualWisdomLab/bandscope/blob/develop/README.md) — setup, workspace layout, verification, and public repository baseline.
- [Brand story](brand-story.md) — product promise, audience, positioning, and voice.
- [Architecture](https://github.com/ContextualWisdomLab/bandscope/blob/develop/ARCHITECTURE.md) — product boundaries, runtime structure, and integration decisions.
- [Application security](security/app-security.md) — desktop trust boundaries and safe-failure expectations.
- [Dependency policy](security/dependency-policy.md) — dependency review, lockfile, audit, and supply-chain rules.
- [Cross-platform build policy](security/cross-platform-build-policy.md) — Windows and macOS release-build expectations.
- [Code security](security/code-security.md) — repository security controls and review expectations.
- [SBOM policy](security/sbom-policy.md) — component inventory and retained software-bill-of-materials evidence.
- [Repository governance](repository/governance.md) — contribution and review governance.
- [Gitflow](repository/gitflow.md) — branch and integration workflow.
- [Contributing](https://github.com/ContextualWisdomLab/bandscope/blob/develop/CONTRIBUTING.md) — contributor entry point.
- [Security reporting](https://github.com/ContextualWisdomLab/bandscope/blob/develop/SECURITY.md) — vulnerability reporting guidance.

## Product and architecture

BandScope keeps rehearsal guidance local-first and separates user-facing rehearsal decisions from lower-level analysis evidence. The desktop shell is built with Tauri and React, shared TypeScript contracts define cross-boundary data, and the Python analysis engine performs offline audio analysis. Product surfaces should expose confidence and limitations rather than imply notation-grade transcription or DAW-style production editing.

Changes involving files, URLs, subprocesses, IPC, WebView, model loading, updates, cache, logs, telemetry, export behavior, dependencies, bundled binaries, or model artifacts must follow the repository security and supply-chain contracts. Cross-platform packaging remains governed by the documented Windows and macOS build gates.

## Onboarding and verification

Install the Node and Python dependencies described in the README, then use the repository harness as the primary local verification entry point:

```bash
./scripts/harness/quickcheck.sh
```

The optional Rust/Tauri lane can be enabled with `BANDSCOPE_ENABLE_RUST_CHECK=1`. A pull request is not release-ready merely because documentation source exists; repository and central CI, security, SAST, SBOM, coverage, cross-platform build, and review gates remain authoritative.

## Releases and deeper exploration

- [GitHub Releases](https://github.com/ContextualWisdomLab/bandscope/releases)
- [Ask DeepWiki](https://deepwiki.com/ContextualWisdomLab/bandscope)
- [ContextualWisdomLab](https://github.com/ContextualWisdomLab)

This file is the public documentation landing source. GitHub Pages should be described as published only after repository settings, deployment, HTTPS availability, and live content are verified.
