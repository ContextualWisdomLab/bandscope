# Tonight's first key

## Decision

The ready rehearsal map names tonight's first stored concert key signature so a player knows which pitch world to tune to, then checks tonight's first range. This is not MIR key detection, a starting-chord metric, capo/transpose advice, or a tuner.

## Authority

- Trusted key is a MusicXML-shaped `{ fifths, mode }` on `song.key`: integer fifths -7 to 7 and mode `major` or `minor`.
- The tonic is spelled from the circle of fifths (E major for fifths 4 / major; C# minor for fifths 4 / minor).
- Missing, extra-keyed, non-integer, church-mode, or out-of-range key fails closed to an ear-check next action. Do not invent C major.

## Trust boundary

- Untrusted input: runtime song roots, `key`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not retune the instrument or apply transposition. The next action is to tune to the named tonic, then check the first range.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`key` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/key/

Kostka, S., Payne, D., & Almén, B. (2018). *Tonal harmony* (8th ed.). McGraw-Hill Education.
