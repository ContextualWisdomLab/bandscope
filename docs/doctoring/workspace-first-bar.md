# Tonight's first bar

## Decision

The ready rehearsal map names tonight's first stored printed-chart measure number so a player knows which bar to count the room into, then checks tonight's first range. This is not beat tracking, a tempo-derived downbeat, pickup detection, or MusicXML engraving.

## Authority

- Trusted bar is a stored integer `measureStart` on the first usable section: 1 to 9999 inclusive.
- The value is the MusicXML `measure` number attribute as printed on the chart, not a duration derived from audio or BPM.
- Missing, non-integer, zero, negative, fractional, or out-of-range `measureStart` fails closed to an ear-check next action. Do not invent bar 1 from tempo.
- The native demo/fallback fixture carries its known printed-chart bar 9; audio-derived analysis sections omit `measureStart` unless a future chart-aware boundary supplies authoritative printed-score metadata.

## Trust boundary

- Untrusted input: runtime song roots, section members, `measureStart`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence authority is created by the workspace callout.
- The persisted project/IPC contract admits the optional integer field but does not turn audio timing or BPM into chart-bar authority.
- Metadata handoff export maps explicit fields and does not leak `measureStart`.
- This does not retune, transpose, or start playback. The next action is to count the room into the named bar, then check the first range.

## Security Notes

### Attack surface and untrusted inputs

The relevant input surface is the rehearsal-song object crossing local analysis, project/IPC, and workspace display boundaries. Runtime song roots, section entries, labels, and `measureStart` must be treated as untrusted until validated. A malformed local project can therefore attempt to supply strings, fractions, zero, negative values, excessively large values, explicit null, or malformed section objects.

### Validation and safe failure

- Shared TypeScript validation and Rust project/IPC deserialization admit only integer `measureStart` values from 1 through 9999 when the field is present.
- The workspace revalidates runtime values before using them as count-in authority and skips malformed sections.
- Missing or invalid bar metadata fails closed to the buyer-visible next action of checking the first printed bar; it is never synthesized from BPM, section timing, or audio-derived downbeats.
- Native demo/fallback data may emit bar 9 because that fixture has an explicit known printed-chart value. The audio-derived pipeline continues to omit the field rather than inventing chart authority.

### Realistic threats

- A malformed or future project payload could try to smuggle an invalid bar value into authoritative rehearsal copy.
- A loosely typed runtime object could place malformed entries before a valid section and cause a crash or mismatched label/bar pairing.
- Audio analysis could be mistaken for printed-score evidence and silently manufacture a plausible-looking count-in bar.

The bounded validators and first-usable-section selection contain the first two cases; explicit omission in audio-derived output prevents the third.

### Logging and privacy impact

This feature adds no telemetry, network request, model request, filesystem path, or new log payload. `measureStart` is ordinary local chart metadata rather than a user identity field, and the metadata handoff export does not include it. Validation failures are represented by absence/fallback behavior rather than logging rehearsal content or path data.

### Residual risk

A valid stored integer can still be musically wrong if a trusted chart/import source entered the wrong printed measure number. The application does not prove score provenance or detect printed bars from audio in this slice, so the UI must continue to present the value as stored chart guidance rather than inferred acoustic truth.

### Test points

- Shared-types rejects zero, fractions, strings, null-when-present, and values above 9999 while retaining legacy omission.
- Rust project/IPC tests round-trip a valid value and reject invalid present values before persistence authority is accepted.
- Workspace tests reject malformed runtime roots/sections and choose the first section carrying a trusted bar without pairing it to a separately scanned label.
- The Python analysis-engine regression keeps the native demo/fallback fixture at bar 9 while the audio-derived pipeline remains barless unless authoritative chart metadata exists.
- Metadata-export tests continue to prove that the field is not leaked through the explicit handoff contract.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`measure` element `number` attribute). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/measure/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
