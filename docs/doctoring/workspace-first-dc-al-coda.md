# Tonight's first D.C. al Coda

## Decision

The ready rehearsal map names tonight's first stored D.C. al Coda so the room can return to the beginning and take the coda jump, then checks tonight's first range. This is not MIR beginning or coda detection, a beginning or coda destination mark, a form tag, OCR, or a section label. It is distinct from Da Capo, Dal Segno, To Coda, Coda, Fine, D.S. al Coda, D.S. al Fine, and D.C. al Fine.

## Authority

- Trusted D.C. al Coda is a MusicXML-shaped `{ label }` on `song.dcAlCoda`: the token `D.C. al Coda` or `D.C. al Coda 1` through `D.C. al Coda 9`.
- Missing, inherited, extra-keyed, lowercase, `Da Capo`, `Dal Segno`, `To Coda`, `Coda`, `D.S. al Coda`, `D.S. al Fine`, `D.C. al Fine`, `al Coda`, `Fine`, `D.S.`, `D.C.`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent D.C. al Coda.
- The song-level contract does not identify the physical beginning or coda destination sections. Customer copy may name the trusted D.C. al Coda instruction, but it must not claim that the first named song section is the return target or the coda landing.

## Trust boundary

- Untrusted input: runtime song roots, `dcAlCoda`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence are added by the callout.
- This does not scroll a score, detect a beginning or coda location, or invent a bar/section target. The next action stays target-agnostic until a future validated contract carries that association.

## Security Notes

- Attack surface: untrusted song JSON, `dcAlCoda.label`, and section labels rendered as React text.
- Trust boundary: lexical admission requires an own `label` property before display; inherited, extra-keyed, or malformed values fail closed.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: D.C. al Coda / D.C. al Coda 1–9 admission, inherited/extra-key/malformed/sibling-navigation rejection, target-agnostic jump planning, particle-safe copy fill, and demo D.C. al Coda plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy name the D.C. al Coda action without asserting unverified beginning or coda destination sections.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`words` / `sound` with da capo and coda). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/sound/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
