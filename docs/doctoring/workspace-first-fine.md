# Tonight's first Fine

## Decision

The ready rehearsal map names tonight's first stored Fine so the room can end together at that mark, then checks tonight's first range. This is not MIR Fine detection, a form tag, OCR, or a section label.

## Authority

- Trusted Fine is a MusicXML-shaped `{ label }` on `song.fine`: the word `Fine` or `Fine 1` through `Fine 9`.
- Missing, extra-keyed, lowercase, `D.C.`, `D.C. al Fine`, `Da Capo`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent Fine.
- Customer copy names the next action: end together at that Fine after the last named section, then check tonight's first range.

## Trust boundary

- Untrusted input: runtime song roots, `fine`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not scroll a score or invent a bar number. The next action is to end together at the named Fine, then check the first range.

## Security Notes

- Attack surface: untrusted song JSON, `fine.label`, and section labels rendered as React text.
- Trust boundary: lexical admission of own-property `label` before display; inherited, extra-keyed, or malformed values stay guidance-only.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: Fine / Fine 1–9 admission, fail-closed missing and malformed labels, particle-safe copy fill, demo Fine end plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy both name the next action (end together at Fine, then check the first range).

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`fine` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/fine/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
