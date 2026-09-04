# Tonight's first D.S. al Coda

## Decision

The ready rehearsal map names tonight's first stored D.S. al Coda so the room can return to the segno and take the coda jump, then checks tonight's first range. This is not MIR segno or coda detection, a segno or coda destination mark, a form tag, OCR, or a section label. It is distinct from Dal Segno, To Coda, Coda, Da Capo, Fine, D.C. al Coda, and D.S. al Fine.

## Authority

- Trusted D.S. al Coda is a MusicXML-shaped `{ label }` on `song.dsAlCoda`: the token `D.S. al Coda` or `D.S. al Coda 1` through `D.S. al Coda 9`.
- Missing, inherited, extra-keyed, lowercase, `Dal Segno`, `To Coda`, `Coda`, `D.C. al Coda`, `D.S. al Fine`, `D.C. al Fine`, `al Coda`, `Fine`, `D.S.`, `D.C.`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent D.S. al Coda.
- The song-level contract does not identify the physical segno or coda destination sections. Customer copy may name the trusted D.S. al Coda instruction, but it must not claim that the first named song section is the return target or the coda landing.

## Trust boundary

- Untrusted input: runtime song roots, `dsAlCoda`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence are added by the callout.
- This does not scroll a score, detect a segno or coda location, or invent a bar/section target. The next action stays target-agnostic until a future validated contract carries that association.

## Security Notes

- Attack surface: untrusted song JSON, `dsAlCoda.label`, and section labels rendered as React text.
- Trust boundary: lexical admission requires an own `label` property before display; inherited, extra-keyed, or malformed values fail closed.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: D.S. al Coda / D.S. al Coda 1–9 admission, inherited/extra-key/malformed/sibling-navigation rejection, target-agnostic jump planning, particle-safe copy fill, and demo D.S. al Coda plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy name the D.S. al Coda action without asserting unverified segno or coda destination sections.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`words` / `sound` with dal segno and coda). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/sound/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
