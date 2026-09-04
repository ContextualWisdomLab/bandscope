# ADR-0001: Deliver playable stems through revocable native authority

- **Status:** Proposed
- **Date:** 2026-09-04
- **Decision owners:** Source Separation, Active Player, Desktop Security
- **Related work:** Issue #961, PR #971, Issue #770, PR #828, Issue #781, PR #866
- **Supersedes:** None

## Context

BandScope already separates admitted local audio into the canonical Demucs sources `vocals`, `bass`, `drums`, and `other`. The analysis pipeline persists NumPy feature arrays for internal reuse, but those arrays are not a renderer-safe media contract. The canonical Active Player in PR #971 can play the admitted full mix through the revocable `bandscope-playback` protocol, yet its stem actions remain unavailable because no real stem source reaches that protocol.

The buyer-visible gap is therefore not another source-separation model. It is a missing product boundary:

```text
successful local separation
→ durable-enough session artifact
→ native validation and authority registration
→ opaque renderer handle
→ the existing Active Player transport
→ audible, truthful stem audition
```

The first implementation must not imply that `other` is a separately identified guitar or keyboard. It must not claim perceptual separation quality merely because an artifact can be played. It must also avoid creating a second transport store beside PR #971.

## Decision

### 1. Materialize a versioned playable-stem artifact set

After successful separation, the analysis engine will materialize the four aligned mono sources as PCM16 WAV files under the current project's app-owned temporary workspace. A single shared gain is applied to the whole set when needed to prevent clipping while preserving inter-stem level relationships.

The internal native manifest is versioned and contains, at minimum:

```text
artifact_set_id
format_version
sample_rate
channel_count
sample_count
duration_seconds
applied_gain
stem_artifacts[]
  artifact_id
  stem_kind
  native_file_path
  file_size_bytes
  content_hash_sha256
  media_type
```

The engine may disclose the native path only to the trusted Tauri process over the existing bounded JSONL subprocess boundary. It must never enter renderer state, UI copy, logs, exported handoffs, or persisted project JSON.

### 2. Extend the existing revocable playback authority

The Tauri layer will validate each artifact against the current project's app-owned root before registering it. Registration requires:

- one artifact for each canonical stem and no unknown stem;
- a regular, non-symlink WAV file under the expected project artifact directory;
- bounded nonzero size;
- manifest/file identity agreement;
- common sample rate, sample count, channel count, and duration;
- no duplicate artifact identifier or stem kind.

The renderer receives only a strict opaque authority such as:

```text
bandscope-project://project-…/stem-vocals
```

The existing `bandscope-playback` protocol remains the only media-serving boundary. Source replacement or project replacement revokes both the full mix and every stem authority together.

### 3. Ship single-source audition before multitrack mixing

The first buyer-visible increment adds a source selector to the existing Active Player:

```text
Full mix | Vocals | Bass | Drums | Other instruments
```

Only sources present in a validated artifact set are enabled. Choosing a source re-arms the current loop on the same transport state machine. The selected source can then use the existing play, pause, stop, seek, count-in, playback-rate, loop-boundary, cue-navigation, and keyboard behavior.

This is genuine isolated-source audition: selecting one stem makes that one generated source audible. It is not yet a multitrack gain mixer. The UI will not show per-stem volume sliders, simultaneous mute combinations, or a synchronization claim until the later multitrack acceptance work is complete.

### 4. Add a synchronized mixer only after measurable timing evidence

A later successor may use one `AudioContext`, one authoritative clock, and per-source gain nodes to support simultaneous stem mixing. It must first prove:

- common decoded duration and sample alignment;
- bounded start and loop-restart skew;
- bounded accumulated drift over a long run;
- deterministic solo, mute, and gain transitions;
- safe device loss, suspension, cancellation, and project close;
- no unbounded decode or full-track duplication beyond the registered resource budget.

Multiple independently controlled `HTMLAudioElement` instances are not an acceptable synchronization architecture.

### 5. Keep capability evidence separate from quality evidence

Artifact creation proves that an output exists and can be played. It does not prove perceptual quality, instrument identity beyond the canonical model outputs, or genre-wide accuracy. Source-separation accuracy and rights-cleared listening evidence remain owned by Issue #770 and PR #828. Resource admission and decode bounds remain owned by Issue #781 and its canonical PR #866.

## Domain ownership

| Responsibility | Owner |
| --- | --- |
| Decode and separation computation | `services/analysis-engine` Source Separation |
| PCM artifact materialization | `services/analysis-engine` Playback Artifact adapter |
| Native path, identity, revocation, and byte-range serving | `apps/desktop/src-tauri` Playback Authority |
| Public status and opaque source contracts | `packages/shared-types` |
| Loop, count-in, seek, rate, and source selection | `apps/desktop` Active Player |
| MIR accuracy and claim boundaries | Issue #770 / PR #828 |
| Resource admission and decode policy | Issue #781 / PR #866 |
| Reopened-project persistence and cleanup recovery | Issue #962 |

The playback artifact adapter does not become a second source-separation owner, and the renderer does not gain filesystem authority.

## Security and privacy

### Attack surface

- model-produced floating-point arrays;
- app-owned cache and temporary directories;
- Python-to-Rust manifest fields;
- custom-protocol paths and byte-range requests;
- renderer source-selection events.

### Trust boundaries

- analysis arrays are untrusted numeric output until shape, finiteness, cardinality, and alignment validation succeeds;
- native paths are untrusted subprocess output until Tauri validates app-owned containment and file identity;
- renderer handles are identifiers only and never paths;
- selecting a source grants no new filesystem, network, export, or generic execution capability.

### Safe failure

Malformed, incomplete, stale, replaced, oversized, unaligned, or non-finite stem sets produce no renderer authority. The full mix remains usable when it is still valid; the UI states that stems are unavailable rather than fabricating successful separation.

### Data handling

Separated audio is sensitive derived media. It remains local, is excluded from logs and ordinary exports, and is scoped to an app-owned project workspace. Session revocation is mandatory in this slice. Durable cleanup, recovery after abnormal termination, and reopened-project retention policy remain explicit Issue #962 follow-up work rather than an implied guarantee.

## Alternatives considered

### A. Put NumPy arrays directly into the renderer

Rejected. `.npz` is an analysis cache format, not a bounded browser media contract. This would expand IPC payloads, expose derived audio to renderer memory, and duplicate decode logic.

### B. Create four independent media elements and keep them aligned with timers

Rejected. Independent media clocks and asynchronous seeks create avoidable drift and race conditions. It would also create a second transport authority beside PR #971.

### C. Wait until the complete multitrack mixer is finished

Rejected. A single-source audition slice closes a real buyer gap, reuses the current transport, and establishes the security contract required by the later mixer without advertising unfinished gain controls.

### D. Export stem files and require users to open another player

Rejected. It breaks the rehearsal loop, exposes filesystem concerns to the user, and does not connect isolated listening to BandScope's sections, cues, and role guidance.

### E. Label `other` as guitar or keys based on the selected role

Rejected. The current canonical model does not establish that identity. The shipped label is `Other instruments` until independently validated model capability says otherwise.

## Consequences

### Positive

- Real separation becomes an audible product capability instead of an internal analysis detail.
- The renderer continues to receive opaque, revocable authority rather than native paths.
- The existing Active Player remains the single transport state machine.
- The design creates a measurable path to a later synchronized mixer without prematurely shipping fake controls.
- Cache hits and fresh separation can converge on the same versioned artifact contract.

### Costs and constraints

- Derived WAV files consume temporary disk space and require explicit lifecycle management.
- The Python/Rust status boundary needs a trusted-internal manifest and a sanitized renderer projection.
- The first slice auditions one source at a time; it does not satisfy the complete multitrack mixing expectation.
- Changes touch Python, Rust, TypeScript, Tauri permissions, CSP/protocol tests, UI, and documentation, so cross-platform exact-head evidence is mandatory.

## Acceptance criteria for `Accepted`

This ADR remains `Proposed` until one unchanged exact head proves all of the following:

1. successful local separation produces exactly four aligned, finite, playable WAV artifacts;
2. a feature-cache hit can recreate or reuse the same artifact contract without rerunning the model;
3. Tauri rejects paths outside the current app-owned project root, symlinks, replacements, stale projects, unknown stems, duplicates, and metadata mismatch;
4. renderer-visible status contains no native path;
5. the source selector exposes only `Full mix`, `Vocals`, `Bass`, `Drums`, and `Other instruments` when actually available;
6. selecting a stem produces observable audio playback through the same section loop and transport controls as the full mix;
7. source replacement, app project replacement, playback error, and project close fail safely;
8. keyboard-only and screen-reader journeys can identify and select the active source;
9. normal, loading, unavailable, error, and partial/fail-closed states have executable component evidence;
10. macOS and Windows production desktop tests use rights-cleared audio and confirm the audible source change;
11. repository-owned production statement and branch coverage and public documentation remain 100%;
12. current-head CI, security, SAST, dependency, SBOM, package, release, review-thread, and independent-approval gates pass without bypass.

## References

Défossez, A. (2021). Hybrid spectrogram and waveform source separation. *Proceedings of the ISMIR 2021 Workshop on Music Source Separation*.

WHATWG. (2026). *HTML Standard: Media elements*. https://html.spec.whatwg.org/multipage/media.html

World Wide Web Consortium. (2024). *Web Audio API 1.1* (First Public Working Draft). https://www.w3.org/TR/webaudio-1.1/
