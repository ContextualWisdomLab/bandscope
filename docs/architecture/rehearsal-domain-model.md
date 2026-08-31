# BandScope Rehearsal Domain Model

## Role taxonomy and extraction targets

BandScope models a song as rehearsal-facing roles, not only as a single global harmonic summary.

- A `role` can be an instrument role, a vocal role, or a hand-specific subdivision when the arrangement exposes it clearly.
- Example roles include bass guitar, guitar, Keyboard 1 left hand, Keyboard 1 right hand, Keyboard 2 left hand, Keyboard 2 right hand, lead vocal, backing vocal harmony, horns, and strings.
- The technical goal is not unlimited score transcription. The goal is enough role separation to make rehearsal decisions per player or role.

## Harmony by section and role

- Harmony should be modeled per section and per role.
- Different roles may carry different voicings or harmonic functions at the same moment.
- The shared contract must not collapse those differences into one global chord answer when the arrangement clearly separates them.

## Keyboard hands and vocal modeling

- Keyboard hands should be modeled separately when left-hand and right-hand material diverge enough to affect rehearsal.
- Lead vocals and backing vocals should be modeled separately when melody, harmony stack, or entry timing differ.
- Vocal-specific outputs should support lyric-linked cue anchors, range pressure, and harmony-entry timing.

## Form, roadmap, and cue anchors

- A section model should support intro, verse, pre-chorus, chorus, bridge, outro, tags, pickups, stops, and handoffs.
- A rehearsal roadmap should expose who enters, who drops out, and where the band must re-enter together.
- Cue anchors should support lyric phrases, count-based entries, or section-transition markers.

## Groove cues and rhythmic feel

- Groove guidance should include practical rehearsal cues such as straight versus swing feel, stop-time moments, sustained versus choppy roles, and shared hits.
- The purpose is rehearsal coordination, not notation-level rhythm engraving.

## Transposition, capo, tuning, and simplification guidance

- A role output may include concert-key versus player-key transposition, capo suggestions, likely tuning or setup notes, and rehearsal-safe simplifications.
- Simplification guidance should separate must-play material from optional color tones or tonight-safe reductions.

## Confidence, provenance, and manual edits

- Confidence must be available per section and per role.
- Manual corrections should preserve provenance so BandScope can distinguish model guesses from user-confirmed edits.
- Rehearsal prioritization should be able to use low-confidence areas as one source of urgency.

## Cue sheet and chart exports

- Exports should be compact rehearsal artifacts rather than DAW sessions or engraved notation.
- Acceptable examples include cue sheets, section roadmaps, role notes, lyric-linked anchors, and chart-style summaries.
- Export formats must stay aligned with `docs/security/app-security.md` export safety rules.
- When every named part is marked ready, the selected-part practice tracker names downloading tonight's cue sheet and sending it to the group as the next action.

## Practice progress

- Each named role may record a 0–100 `practiceProgress` percentage for tonight's prep.
- Missing progress means the part has not been marked started.
- After a named part is selected, the workspace must name the next action: start, continue, switch to the next unready named part, or send the cue sheet.
- Inherited, non-finite, out-of-range, unnamed, duplicated, or conflicting section copies fail closed and must not become rehearsal authority.

## Rehearsal prioritization

- The system should be able to rank what matters first by role and by section.
- Typical priority drivers include difficult entries, dense overlap, low-confidence harmony, setup changes, and likely train-wreck sections.
