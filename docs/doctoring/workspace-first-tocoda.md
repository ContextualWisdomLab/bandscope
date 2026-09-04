# Tonight's first To Coda

## Decision

The ready rehearsal map names tonight's first stored To Coda so the room can take that jump to the coda, then checks tonight's first range. This is not MIR coda detection, a coda destination mark, a form tag, OCR, or a section label.

## Authority

- Trusted To Coda is a MusicXML-shaped `{ label }` on `song.toCoda`: the token `To Coda` or `To Coda 1` through `To Coda 9`.
- Missing, inherited, extra-keyed, lowercase, `Coda`, `D.S. al Coda`, `D.C. al Coda`, `al Coda`, `Fine`, `D.S.`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent To Coda.
- The song-level contract does not identify the physical coda destination section. Customer copy may name the trusted To Coda instruction, but it must not claim that the first named song section is the jump target.

## Trust boundary

- Untrusted input: runtime song roots, `toCoda`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence are added by the callout.
- This does not scroll a score, detect a coda location, or invent a bar/section target. The next action stays target-agnostic until a future validated contract carries that association.

## Security Notes

- Attack surface: untrusted song JSON, `toCoda.label`, and section labels rendered as React text.
- Trust boundary: lexical admission requires an own `label` property before display; inherited, extra-keyed, or malformed values fail closed.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: To Coda / To Coda 1–9 admission, inherited/extra-key/malformed rejection, target-agnostic jump planning, particle-safe copy fill, and demo To Coda plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy name the To Coda action without asserting an unverified destination section.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`tocoda` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/tocoda/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
