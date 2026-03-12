# Issue 35 Section Roadmap Design

## Context

BandScope already models a rehearsal song as `song -> section -> role`, but the current section shape is too thin for real roadmap use. It only exposes a free-text `label`, `groove`, and section confidence, while the domain model explicitly requires typed section kinds, markers such as pickups/stops/handoffs, and cue anchors that can drive a roadmap UI.

## Constraints

- The current safest slice is contract- and fixture-driven, not real extraction heuristics from audio.
- Shared types, the Python demo result, and the desktop UI must stay aligned.
- The change should satisfy issue `#35` without overlapping too much with later issues for role graph, harmony extraction, or a richer workspace UI.
- The result should be immediately consumable by a roadmap-oriented UI, even if the UI remains simple.

## Approaches

### Approach 1: Add typed form metadata to `RehearsalSection`

Additive changes to the existing section model:
- `kind`
- `markers`
- `primaryCue`

Trade-offs:
- Pros: lowest risk, minimal churn, easy to mirror in Python and UI.
- Cons: section entries/dropouts remain implicit for now.

### Approach 2: Introduce a separate roadmap model alongside sections

Create an additional `roadmap` object with form and cue semantics.

Trade-offs:
- Pros: could support richer transitions and navigation later.
- Cons: duplicates section identity and increases schema/UI complexity immediately.

### Approach 3: Implement heuristic extraction now

Build actual segmentation logic in Python and have the schema follow it.

Trade-offs:
- Pros: closer to end-state behavior.
- Cons: too large for the current step and mixes contract work with signal-processing decisions.

## Decision

Use Approach 1.

BandScope will extend `RehearsalSection` with typed form metadata and update the demo fixture to a representative multi-section arrangement. The Python engine demo result will mirror the same structure, and the desktop shell will render the new section roadmap details directly.

## Data Model

Add to shared types:
- `SectionKind = "intro" | "verse" | "pre_chorus" | "chorus" | "bridge" | "outro"`
- `SectionMarker = "tag" | "pickup" | "stop" | "handoff"`
- `RehearsalSection.primaryCue?: CueAnchor`
- `RehearsalSection.kind`
- `RehearsalSection.markers`

The demo song will become:
- Intro
- Verse 1
- Pre-Chorus
- Chorus
- Bridge
- Outro

At least one section will carry each of:
- a lyric cue
- a count cue
- a transition cue
- a `pickup` or `handoff` marker
- a low-confidence section

## UI Consumption

The desktop shell will show:
- section kind
- section markers
- primary cue summary

This is enough to demonstrate roadmap readiness without adding a dedicated roadmap panel yet.

## Testing

- Shared-types tests for new form metadata and fixture coverage.
- Python tests ensuring the demo result includes the new section fields and representative sequence.
- Desktop tests confirming section-kind, marker, and cue rendering.

## Security Notes

### Attack surface

- typed rehearsal result payload crossing shared-types, Rust, and Python boundaries

### Trust boundary

- Python demo result -> Rust orchestration -> React render path

### Realistic threats

- contract drift between TypeScript and Python
- UI rendering assumptions on missing section metadata

### Mitigations

- strict contract validation in shared-types and Python tests
- additive schema changes only
- safe rendering that tolerates optional cue presence

### Test points

- typed section-kind validation
- typed marker validation
- representative multi-section fixture validation

### Remaining risk

- section sequencing is still fixture-driven rather than extracted from real audio; later extraction issues must preserve the same contract semantics.
