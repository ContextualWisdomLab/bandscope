# Tonight's first D.S. al Fine

## Decision

The ready rehearsal map names tonight's first stored D.S. al Fine so the room can return to the segno and end at Fine, then checks tonight's first range. This is not MIR segno or Fine detection, a segno or Fine destination mark, a form tag, OCR, or a section label. It is distinct from Dal Segno, Fine, To Coda, Coda, D.S. al Coda, D.C. al Coda, and D.C. al Fine.

## Authority

- Trusted D.S. al Fine is a MusicXML-shaped `{ label }` on `song.dsAlFine`: the token `D.S. al Fine` or `D.S. al Fine 1` through `D.S. al Fine 9`.
- Missing, inherited, extra-keyed, lowercase, `Dal Segno`, `Fine`, `To Coda`, `Coda`, `D.S. al Coda`, `D.C. al Coda`, `D.C. al Fine`, `al Fine`, `D.S.`, `D.C.`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent D.S. al Fine.
- The song-level contract does not identify the physical segno or Fine destination sections. Customer copy may name the trusted D.S. al Fine instruction, but it must not claim that the first named song section is the return target or the Fine landing.

## Trust boundary

- Untrusted input: runtime song roots, `dsAlFine`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence are added by the callout.
- This does not scroll a score, detect a segno or Fine location, or invent a bar/section target. The next action stays target-agnostic until a future validated contract carries that association.

## Security Notes

- Attack surface: untrusted song JSON, `dsAlFine.label`, and section labels rendered as React text.
- Trust boundary: lexical admission requires an own `label` property before display; inherited, extra-keyed, or malformed values fail closed.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: D.S. al Fine / D.S. al Fine 1–9 admission, inherited/extra-key/malformed/sibling-navigation rejection, target-agnostic jump planning, particle-safe copy fill, and demo D.S. al Fine plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy name the D.S. al Fine action without asserting unverified segno or Fine destination sections.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`words` / `sound` with dal segno and fine). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/sound/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
