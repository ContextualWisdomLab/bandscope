# Tonight's first bar

## Decision

The ready rehearsal map names tonight's first stored printed-chart measure number so a player knows which bar to count the room into, then checks tonight's first range. This is not beat tracking, a tempo-derived downbeat, pickup detection, or MusicXML engraving.

## Authority

- Trusted bar is a stored integer `measureStart` on the first usable section: 1 to 9999 inclusive.
- The value is the MusicXML `measure` number attribute as printed on the chart, not a duration derived from audio or BPM.
- Missing, non-integer, zero, negative, fractional, or out-of-range `measureStart` fails closed to an ear-check next action. Do not invent bar 1 from tempo.

## Trust boundary

- Untrusted input: runtime song roots, section members, `measureStart`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- Metadata handoff export maps explicit fields and does not leak `measureStart`.
- This does not retune, transpose, or start playback. The next action is to count the room into the named bar, then check the first range.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`measure` element `number` attribute). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/measure/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
