# BandScope

BandScope is a local-first rehearsal assistant that turns a song into a practical rehearsal map: section-aware harmony, role-specific cues, song form, tempo and groove guidance, stem previews, playable ranges, overlap warnings, simplification/transposition hints, visible confidence, and rehearsal priorities without DAW complexity.

**귀로만 버티던 카피를, 눈으로 정리해 합주 시간을 음악에 더 쓰게 합니다.**

[Ask DeepWiki](https://deepwiki.com/ContextualWisdomLab/bandscope)

## Start here

- [Repository README](https://github.com/ContextualWisdomLab/bandscope/blob/develop/README.md) — product value, setup, boundaries, verification, and licensing status.
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

BandScope is built for rehearsal decisions rather than production editing. Its analysis target is `song → section → role`, so different players can receive different guidance in the same section instead of one flattened global chord label. Automatic analysis stays editable and confidence/provenance should remain visible when uncertainty can change rehearsal decisions.

The desktop shell and offline analysis engine are separated by explicit shared contracts. Files, URLs, subprocesses, IPC, WebView, model loading, updates, cache, logs, telemetry, exports, dependencies, bundled binaries, and model artifacts remain governed by the repository security and supply-chain controls.

## Onboarding and verification

Install the Node and Python dependencies described in the README, then use the repository harness as the primary local verification entry point:

```bash
./scripts/harness/quickcheck.sh
```

The optional Rust/Tauri lane can be enabled with `BANDSCOPE_ENABLE_RUST_CHECK=1`. A pull request is not release-ready merely because documentation source exists; repository and central CI, security, SAST, SBOM, coverage, cross-platform build, and review gates remain authoritative.

## Commercial licensing status

BandScope's ContextualWisdomLab-owned source is provided under the repository's MIT License. Third-party source, native libraries, and model artifacts remain under their own licenses and must satisfy dependency/SBOM policy.

The current Python analysis dependency set includes `soundfile>=0.13.1`. SoundFile itself is BSD-3-Clause, but its documented binary-wheel/runtime path relies on and can bundle LGPL libsndfile. [Issue #1129](https://github.com/ContextualWisdomLab/bandscope/issues/1129) owns replacement/removal of that native path. Until it closes with equivalent real-audio and Windows/macOS evidence, the current analysis stack is not represented as fully compliant with ContextualWisdomLab's commercial inbound-license baseline.

- [MIT project license](https://github.com/ContextualWisdomLab/bandscope/blob/develop/LICENSE)
- [Dependency policy](security/dependency-policy.md)
- [SBOM policy](security/sbom-policy.md)

## Releases and deeper exploration

- [GitHub Releases](https://github.com/ContextualWisdomLab/bandscope/releases)
- [Ask DeepWiki](https://deepwiki.com/ContextualWisdomLab/bandscope)
- [ContextualWisdomLab](https://github.com/ContextualWisdomLab)

This file is the public documentation landing source. GitHub Pages should be described as published only after repository settings, deployment, HTTPS availability, and live content are verified.
