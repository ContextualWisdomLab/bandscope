# Tonight's first Dal Segno

## Decision

The ready rehearsal map names tonight's first stored Dal Segno so the room can go back to the segno at that mark, then checks tonight's first range. This is not MIR Dal Segno detection, a segno mark, a form tag, OCR, or a section label.

## Authority

- Trusted Dal Segno is a MusicXML-shaped `{ label }` on `song.dalSegno`: the token `D.S.` or `D.S. 1` through `D.S. 9`.
- Missing, extra-keyed, lowercase, `Fine`, `D.S. al Coda`, `D.S. al Fine`, `Dal Segno`, `D.C.`, `segno`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent Dal Segno.
- Customer copy names the next action: go back to the segno at that D.S., start the first named section, then check tonight's first range.

## Trust boundary

- Untrusted input: runtime song roots, `dalSegno`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not scroll a score or invent a bar number. The next action is to go back to the segno at the named D.S., then check the first range.

## Security Notes

- Attack surface: untrusted song JSON, `dalSegno.label`, and section labels rendered as React text.
- Trust boundary: lexical admission of own-property `label` before display; inherited, extra-keyed, or malformed values stay guidance-only.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: D.S. / D.S. 1–9 admission, fail-closed missing and malformed labels, particle-safe copy fill, demo Dal Segno restart plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy both name the next action (go back to the segno at D.S., then check the first range).

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`dalsegno` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/dalsegno/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
