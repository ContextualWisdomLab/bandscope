# BandScope

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ContextualWisdomLab/bandscope)

**귀로만 버티던 카피를, 눈으로 정리해 합주 시간을 음악에 더 쓰게 합니다.**

BandScope is a local-first rehearsal assistant for people who need to understand a song quickly before practice. Drop in audio, inspect likely harmony by section and playing role, follow the song form, check tempo and groove cues, preview separated parts, see playable ranges and overlap warnings, and turn uncertainty into a short list of things the band should verify first.

BandScope is not a DAW, notation-grade transcription system, or authority that claims one automatic answer is always correct. Analysis stays editable, confidence stays visible, and the product is designed to help musical judgment rather than replace it.

## What you get before rehearsal

| Need | BandScope view |
| --- | --- |
| “What happens in each section?” | Section roadmap with likely harmony, entries, dropouts, pickups, stops, tags, and handoffs. |
| “What should *my* part do?” | Role-specific guidance for instruments, vocals, and hand-specific keyboard parts when the arrangement exposes them. |
| “Where will we lose time?” | Rehearsal priorities, confidence flags, range/density or overlap warnings, and simplification hints. |
| “Can we make this playable tonight?” | Transposition, capo/tuning/setup cues and rehearsal-friendly export summaries where supported. |
| “Can I trust the result?” | Local-first analysis, visible uncertainty, editable output, provenance for automatic versus user-confirmed decisions, and narrow security boundaries. |

The product source of truth for audience, tone, and prioritization is [`docs/brand-story.md`](docs/brand-story.md). The tie-breaker is simple: **does this help people rehearse better, sooner, without lowering the accuracy they need?**

## Quick start

### Prerequisites

- Node `>=22.13 <23` and npm `10.9.9` for the desktop workspace
- Python 3.12+ and `uv` for the analysis engine
- Rust stable plus the platform-native toolchain when validating the Tauri desktop package

Install the JavaScript and Python workspaces:

```bash
npm install
uv sync --project services/analysis-engine --group dev
```

Run the repository's primary local verification path:

```bash
./scripts/harness/quickcheck.sh
```

When the native desktop toolchain is ready, include the Rust/Tauri lane:

```bash
BANDSCOPE_ENABLE_RUST_CHECK=1 ./scripts/harness/quickcheck.sh
```

macOS requires Xcode command line tools and an accepted Xcode license. Windows native packaging requires the MSVC build toolchain. Cross-platform release evidence remains governed by the repository's Windows and macOS build policy rather than by a single developer machine.

## Product boundaries

BandScope analyzes for **rehearsal decisions**, not studio prestige. Its target model is `song → section → role`, so simultaneous players can receive different guidance instead of one flattened chord label for the entire arrangement.

The product should expose, where supported and sufficiently confident:

- likely harmony by section and role;
- section form and rehearsal cues;
- tempo, groove, entry, dropout, stop, pickup, and handoff cues;
- instrument and vocal ranges;
- stem previews and role-focused listening support;
- density/overlap warnings and simplification guidance;
- transposition, capo, tuning, or setup guidance;
- role-specific rehearsal priorities;
- confidence and provenance that distinguish automatic analysis from user-confirmed edits;
- compact cue-sheet/JSON/CSV-style outputs intended for rehearsal use.

Uncertain output must stay visibly uncertain. Product simplification should remove friction, not hide evidence or lower analytical correctness.

## Local-first architecture

The desktop shell and the analysis engine are separated by explicit shared contracts. User-facing rehearsal decisions remain distinct from lower-level analysis evidence, and risky capabilities—files, URLs, subprocesses, IPC, model loading, updates, cache, logs, telemetry, and exports—are expected to stay narrow, allowlisted, and fail-safe.

Repository map:

- `apps/desktop` — desktop UI and local application shell
- `packages/shared-types` — cross-boundary rehearsal contracts
- `services/analysis-engine` — offline audio analysis
- `scripts/harness` — reproducible verification entry points
- `docs/` — product, architecture, security, operations, and delivery evidence

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the current technical boundary and [`docs/security/app-security.md`](docs/security/app-security.md) for the trust model.

## Current implementation status

The repository currently contains the local-first workflow, audio intake, offline analysis path, section/role outputs, manual user overrides, and CSV/JSON cue-sheet exports described by the existing implementation baseline. Coverage and docstring claims remain meaningful only where current repository checks measure them; protected CI and release evidence, not this README, are authoritative for exact-current quality status.

### Commercial dependency status

The repository's own source is MIT-licensed, but the current analysis dependency set includes `soundfile>=0.13.1`. The Python SoundFile wrapper is BSD-3-Clause; its documented platform-wheel/runtime path relies on and can bundle **libsndfile**, which is LGPL. That transitive native path does not satisfy ContextualWisdomLab's commercial inbound-license baseline.

[Issue #1129](https://github.com/ContextualWisdomLab/bandscope/issues/1129) owns replacement/removal of the libsndfile-backed path with commercially approved provenance and equivalent real-audio behavior. Until that closes with Windows/macOS evidence, do not describe the current analysis stack as fully compliant with the organization's commercial inbound-license policy.

## Security and supply chain

Before changing product or implementation boundaries, start with:

- [Application security](docs/security/app-security.md)
- [Dependency policy](docs/security/dependency-policy.md)
- [Cross-platform build policy](docs/security/cross-platform-build-policy.md)
- [Code security](docs/security/code-security.md)
- [SBOM policy](docs/security/sbom-policy.md)
- [GitHub bootstrap execution policy](docs/workflow/github-bootstrap-execution-policy.md)
- [Repository governance](docs/repository/governance.md)

Changes involving files, URLs, subprocesses, IPC, WebView, models, updates, cache, logs, telemetry, exports, dependencies, Actions, bundled binaries, or model artifacts must preserve those controls and update the corresponding evidence rather than adding local exceptions.

## Documentation

- [Public documentation home](docs/index.md)
- [Brand story](docs/brand-story.md)
- [Architecture](ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Gitflow](docs/repository/gitflow.md)
- [GitHub bootstrap execution policy](docs/workflow/github-bootstrap-execution-policy.md)
- [Repository governance](docs/repository/governance.md)
- [Deployment/runbook](docs/operations/deploy-runbook.md)

## License

BandScope's ContextualWisdomLab-owned source is provided under the [MIT License](LICENSE).

Third-party software and model artifacts remain under their own licenses and must satisfy the repository's dependency/SBOM policy and the organization's commercial inbound-license policy. The libsndfile LGPL exception currently reachable through SoundFile is a tracked product/compliance defect, not part of the MIT grant and not an approved commercial baseline.
