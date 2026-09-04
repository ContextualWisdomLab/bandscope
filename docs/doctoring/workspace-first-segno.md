# Tonight's first segno

## Decision

The ready rehearsal map names tonight's first stored segno so the room can return together to that mark, then checks tonight's first range. This is not MIR segno detection, a form tag, OCR, or a section label.

## Authority

- Trusted segno is a MusicXML-shaped `{ label }` on `song.segno`: the word `Segno` or `Segno 1` through `Segno 9`.
- Missing, extra-keyed, lowercase, `D.S.`, `Dal Segno`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent Segno.
- Customer copy names the next action: return to that segno after the last named section, then check tonight's first range.

## Trust boundary

- Untrusted input: runtime song roots, `segno`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not scroll a score or invent a bar number. The next action is to return together at the named segno, then check the first range.

## Security Notes

- Attack surface: untrusted song JSON, `segno.label`, and section labels rendered as React text.
- Trust boundary: lexical admission of own-property `label` before display; inherited, extra-keyed, or malformed values stay guidance-only.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: Segno / Segno 1–9 admission, fail-closed missing and malformed labels, particle-safe copy fill, demo Segno return plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy both name the next action (return to the segno, then check the first range).

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`segno` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/segno/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
