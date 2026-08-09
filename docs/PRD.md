# BandScope Product Requirements Document

Status: Active authority
Last updated: 2026-08-09

## Product outcome

BandScope turns a legally accessible song into a local-first, editable rehearsal view: form,
role-specific harmony and range, groove and entry cues, separated stem previews, confidence, and
rehearsal priority. It serves band leaders and players who need actionable preparation without a
DAW or notation-grade transcription workflow.

Issue #770 and ADR-0002 establish one essential proof obligation: BandScope must demonstrate that
its production YouTube intake and production separator improve a real, known source rather than
merely returning plausible-looking arrays or synthetic demo output.

This is a bounded source-separation slice of GitHub issue #770, not completion of its broader
harmony, beat/tempo, structure, range, cue, confidence, public-corpus, private-corpus, manifest,
CPU/GPU, and report requirements.

## Users and jobs

- A band leader imports an authorized public YouTube track and needs trustworthy separated material
  for assigning and checking rehearsal parts.
- A player needs a local stem preview and an honest confidence/failure state, not a silent fallback
  to the original mixture.
- A maintainer needs reproducible evidence that model, downloader, fixture, and quality thresholds
  still work together after dependency, model, or platform changes.
- A release owner needs evidence that external-media rights, model provenance, security boundaries,
  and failure recovery are controlled.

## Product requirements

| ID | Requirement | Acceptance evidence | Status |
|---|---|---|---|
| PRD-KS-001 | Exercise the production YouTube download boundary with a real public mix whose creator-published source contains a known stem. | Live test calls `download_youtube_audio()` and validates the exact video ID. | `active_branch` |
| PRD-KS-002 | Exercise the real production source separator, not a mock, FFT profile, or generated-only mixture. | Live test calls `AudioStemSeparator.separate()` and receives canonical vocals/bass/drums/other arrays. | `active_branch` |
| PRD-KS-003 | Measure improvement against ground truth with an independently defined metric. | Zero-mean SI-SDR improvement is at least the provisional +0.5 dB sentinel over the downloaded mix; an authorized YouTube baseline is still required before release blocking. | `active_branch` |
| PRD-KS-004 | Verify semantic stem assignment. | Vocal SI-SDR exceeds the best incorrectly named stem by at least 3.0 dB. | `active_branch` |
| PRD-KS-005 | Detect fixture drift instead of blaming the model. | The downloaded mix is aligned to a separately pinned creator master with duration drift ≤ 1.0 s and correlation ≥ 0.90; that lag is composed once with the master-to-vocal lag before inference. | `active_branch` |
| PRD-KS-006 | Keep normal CI deterministic while preserving a real integration proof. | Metric, alignment, integrity, redirect, path, cleanup, and failure tests run offline; live access is explicit opt-in and fail-closed. | `active_branch` |
| PRD-KS-007 | Respect content and platform restrictions. | No cookies, account login, paywall, DRM, geo, or anti-bot bypass; operator records authorization before live use. | `active_branch` |
| PRD-KS-008 | Keep downloaded media ephemeral and private. | Test-owned directory is removed on success and failure; raw audio, full paths, URLs, tokens, and cookies are not logged or retained. | `active_branch` |
| PRD-KS-009 | Make release quality evidence reviewable. | Exact commit, model identity, fixture hashes, platform, command, outcome, and numeric scores are retained as a bounded CI/operator artifact. | `planned` |
| PRD-KS-010 | Fail safely when the live ecosystem is unavailable. | Download/model/integrity/drift failures are distinct, do not become passes, and do not block unrelated development work. | `active_branch` |

## Scope and non-goals

The first fixture makes a quantitative claim only for the vocal stem of Brad Sucks' *Making Me
Nervous*. The reference is a dry, loop-oriented vocal stem, so a separately pinned finished master
establishes YouTube asset identity. It does not prove four-stem quality, all genres, all YouTube transcodes, perceptual quality,
or notation accuracy. The benchmark is a quality sentinel, not a general downloader, media archive,
model-training dataset, or legal opinion.

BandScope must not retain user media in hosted telemetry or introduce a relational benchmark
database merely to satisfy documentation conventions. Results remain ephemeral until a separate
audited evidence-retention requirement is accepted.

## Failure experience

The user-facing product must explain whether import, model availability, decode, or separation
failed and offer local-file fallback without exposing raw provider errors or sensitive paths. The
benchmark itself must retain stable diagnostic codes and numeric scores; it must never silently skip
after explicit opt-in.

## Release acceptance

The known-stem lane becomes blocking for a release only after all of the following exist:

1. documented authorization for the chosen live access mode;
2. full-hash pre-load verification of the exact model artifact;
3. at least one recorded passing supported-platform run on the exact release candidate;
4. thresholds calibrated on an authorized YouTube candidate and a drift/flake triage owner;
5. ordinary CI, security, coverage, packaging, SBOM, review, and provenance gates pass.

Until then, the deterministic offline contract is required and live evidence is advisory but must
fail closed when deliberately invoked.

## Ownership and rollout

The analysis-engine owner owns metrics, fixture integrity, alignment, separator integration, and
failure taxonomy. Release engineering owns model/tool inventory and retained evidence. Repository
governance owns rights/platform authorization and the decision to make live execution scheduled or
blocking. Rollout proceeds from local opt-in, to controlled release-candidate evidence, to a
blocking lane only through a superseding ADR.
