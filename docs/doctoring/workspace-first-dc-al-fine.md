# Tonight's first D.C. al Fine

## Decision

The ready rehearsal map names tonight's first stored D.C. al Fine so the room can return to the beginning and end at Fine, then checks tonight's first range. This is not MIR beginning or Fine detection, a beginning or Fine destination mark, a form tag, OCR, or a section label. It is distinct from Da Capo, Dal Segno, Fine, To Coda, Coda, D.S. al Coda, D.C. al Coda, and D.S. al Fine.

## Authority

- Trusted D.C. al Fine is a MusicXML-shaped `{ label }` on `song.dcAlFine`: the token `D.C. al Fine` or `D.C. al Fine 1` through `D.C. al Fine 9`.
- Missing, inherited, extra-keyed, lowercase, `Da Capo`, `Dal Segno`, `Fine`, `To Coda`, `Coda`, `D.S. al Coda`, `D.C. al Coda`, `D.S. al Fine`, `al Fine`, `D.S.`, `D.C.`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent D.C. al Fine.
- The song-level contract does not identify the physical beginning or Fine destination sections. Customer copy may name the trusted D.C. al Fine instruction, but it must not claim that the first named song section is the return target or the Fine landing.

## Trust boundary

- Untrusted input: runtime song roots, `dcAlFine`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence are added by the callout.
- This does not scroll a score, detect a beginning or Fine location, or invent a bar/section target. The next action stays target-agnostic until a future validated contract carries that association.

## Security Notes

- Attack surface: untrusted song JSON, `dcAlFine.label`, and section labels rendered as React text.
- Trust boundary: lexical admission requires an own `label` property before display; inherited, extra-keyed, or malformed values fail closed.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: D.C. al Fine / D.C. al Fine 1–9 admission, inherited/extra-key/malformed/sibling-navigation rejection, target-agnostic jump planning, particle-safe copy fill, and demo D.C. al Fine plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy name the D.C. al Fine action without asserting unverified beginning or Fine destination sections.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`words` / `sound` with da capo and fine). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/sound/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
