# Tonight's first meter

## Decision

The ready rehearsal map names tonight's first stored time signature so a player knows how many beats to count in, then checks tonight's first range. This is not MIR meter detection, song playback, or a click engine.

## Authority

- Trusted meter is a MusicXML-shaped `{ beats, beatType }` on `song.meter`: integer numerator 1–16 and denominator 1, 2, 4, 8, or 16.
- Count-in length is the written numerator, except compound 6/8, 9/8, and 12/8 which count the dotted-quarter pulse (2, 3, and 4).
- Missing, extra-keyed, non-integer, or unsupported meter fails closed to an ear-count next action. Do not invent 4/4.

## Trust boundary

- Untrusted input: runtime song roots, `meter`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not synthesize a click. The next action is to count in the named grouping, then check the first range.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`time` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/time/

London, J. (2012). *Hearing in time: Psychological aspects of musical meter* (2nd ed.). Oxford University Press. https://doi.org/10.1093/acprof:oso/9780199744376.001.0001
