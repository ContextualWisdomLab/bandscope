# Transcription timing admission

## Decision

`TranscriptionNote.onset` and `TranscriptionNote.offset` are shared rehearsal-contract values. The runtime parser must reject non-finite IEEE-754 values (`NaN`, `+Infinity`, `-Infinity`) before a rehearsal song reaches Workspace, GrooveMap, Active Player, persistence, or export consumers.

The parser keeps the existing finite timing domain unchanged. This change does not add `onset >= 0`, `offset >= 0`, or `offset >= onset`. Those are separate musical/domain invariants and require fixture and persistence evidence before they can become shared-contract requirements.

## Why the boundary is shared

The TypeScript `number` type does not distinguish finite values from `NaN` or infinities at runtime. Consumer-side guards would duplicate validation and still leave persistence/export callers exposed. `parseRehearsalSong()` and `isRehearsalSong()` are the canonical runtime admission boundary used by those consumers, so the rejection belongs in `validateTranscriptionNote()`.

Downstream rendering performs timing arithmetic such as percentage positions and widths. Admitting non-finite timing therefore permits invalid layout arithmetic even though the object satisfies a superficial `typeof value === "number"` check.

## Verification contract

`packages/shared-types/test/transcription-timing-admission.test.ts` covers all three non-finite values independently for onset and offset. Each hostile payload must fail both the boolean type guard and the throwing parser with the exact nested field path. The same suite also fixes the claim boundary by proving currently accepted finite values, including negative and inverted timings, remain accepted until a separate domain decision changes that contract.

## Traceability

- Finding: issue #1253.
- RED: `73c60d5d85684eedf274b6b2dde4272a95b534a1` adds hostile runtime fixtures without changing production validation.
- Causal repair: `7dec5a64d5a265cbf75ac735e286d8529c09c31f` adds finite-number admission to onset and offset.
- Repair follow-up: `53cc2c6057b34cf006232d47599532fd9f8f0d3f` removes an unrelated metadata-handoff validation line introduced while writing the full-file repair; the final diff against protected `develop` is limited to the two finite checks plus the focused test file and this document.

## Security Notes

This is a local runtime-schema boundary. It adds no network path, filesystem capability, subprocess behavior, telemetry, dependency, or PII flow. Failure is fail-closed at parse time and error text contains only the stable field path, not note content or local file metadata.
