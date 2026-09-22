# Transcription timing admission

## Decision

`TranscriptionNote.onset` and `TranscriptionNote.offset` are shared rehearsal-contract values. A note is admitted only when both values are finite, `onset >= 0`, and `offset > onset`.

This combines the representation boundary from #1253 with the audio-relative interval invariant from #1255. `NaN`, `+Infinity`, `-Infinity`, negative onset, zero-duration intervals, and inverted intervals fail before Workspace, GrooveMap, Active Player, persistence, or export consumers can interpret them differently. JavaScript negative zero is accepted as zero because `-0 < 0` is false and it does not represent a distinct timeline position.

Velocity remains outside this decision. Repository fixtures use both normalized-looking and MIDI-like velocity values, so no scale or range is invented here without producer/consumer evidence.

## Why the boundary is shared

The TypeScript `number` type does not distinguish finite values from `NaN` or infinities at runtime, and it does not encode an ordered audio interval. Consumer-side clamps would duplicate policy while allowing persistence, export, or another rehearsal view to interpret the same malformed note differently. `parseRehearsalSong()` and `isRehearsalSong()` are the canonical runtime admission boundary, so `validateTranscriptionNote()` owns the invariant.

The protected transcription producer supports this domain. `_note_events_from_frames()` derives `start_time` from non-negative frame indices, computes `duration = end_time - start_time`, and drops events shorter than `MIN_NOTE_DURATION_SECONDS = 0.05`. The repository-owned producer therefore does not intentionally emit negative starts or non-positive durations.

GrooveMap consumes these values as timeline geometry: onset determines horizontal position and `offset - onset` determines note width. A negative onset creates a position before the audio origin; an equal or inverted interval creates zero or negative width. Rejecting those values at shared admission is therefore rehearsal rendering correctness, not schema cleanup.

## Persistence and recovery boundary

Desktop `saveProject()` parses a song before invoking native persistence, and `loadProject()` parses the native response before returning it to the UI. A durable project that contains an impossible transcription interval must therefore fail closed with the exact nested field path. This repair does not silently clamp, reorder, or rewrite durable note timing.

If a historical project carrying malformed note intervals is discovered, recovery or migration must classify that incompatibility explicitly. Weakening the shared invariant or silently mutating durable data is not an acceptable compatibility strategy.

## Verification contract

`packages/shared-types/test/transcription-timing-admission.test.ts` verifies both boolean and throwing admission paths:

- all three non-finite IEEE-754 values fail independently for onset and offset;
- negative onset fails at `.onset`;
- equal or inverted offset fails at `.offset`;
- onset `0` and `-0` with positive duration remain accepted;
- an ordinary positive audio-relative interval remains accepted.

No consumer-side `Math.max`, CSS clamp, persistence-only cleanup, or format-specific duplicate validator substitutes for this shared contract.

## Traceability

- #1253: non-finite timing representation finding.
- `73c60d5d85684eedf274b6b2dde4272a95b534a1`: initial non-finite hostile RED.
- `7dec5a64d5a265cbf75ac735e286d8529c09c31f`: finite-number admission repair.
- `53cc2c6057b34cf006232d47599532fd9f8f0d3f`: removes an unrelated metadata-handoff delta introduced during that repair.
- #1255: finite but impossible audio-relative interval finding, grounded in GrooveMap geometry and the repository transcription producer.
- `9a27a87f8c2c74614d84acb23458845949f948a0`: hostile interval RED for negative onset, zero duration, inverted duration, and the zero/negative-zero boundary.
- `95356c11a76716dde927bfe311dffb5eec4cf9e1`: causal shared-validator repair requiring `onset >= 0` and `offset > onset`.

## Rejected alternatives

- Clamp negative onset or width in GrooveMap: rejected because malformed data remains valid elsewhere.
- Swap or normalize onset/offset during persistence: rejected because durable source data would be changed silently.
- Validate only when opening a project: rejected because analysis result, export, and in-memory callers use the same shared contract.
- Add a velocity range in the same change: rejected because the canonical velocity scale is not yet established.

## Security Notes

This is a local runtime-schema boundary. It adds no network path, filesystem capability, subprocess behavior, telemetry, dependency, or PII flow. Failure is fail-closed at parse time, and error text contains only the stable field path rather than note contents or local file metadata.
