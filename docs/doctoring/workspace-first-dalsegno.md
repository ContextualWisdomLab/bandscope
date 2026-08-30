# Tonight's first Dal Segno

## Decision

The ready rehearsal map names tonight's first stored Dal Segno so the room can go back to the segno at that mark, then checks tonight's first range. This is not MIR Dal Segno detection, a segno mark, a form tag, OCR, or a section label.

## Authority

- Trusted Dal Segno is a MusicXML-shaped `{ label }` on `song.dalSegno`: the token `D.S.` or `D.S. 1` through `D.S. 9`.
- Missing, inherited, extra-keyed, lowercase, `Fine`, `D.S. al Coda`, `D.S. al Fine`, `Dal Segno`, `D.C.`, `segno`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent Dal Segno.
- The song-level contract does not identify the physical segno target section. Customer copy may name the trusted D.S. instruction, but it must not claim that the first named song section is the restart target.

## Trust boundary

- Untrusted input: runtime song roots, `dalSegno`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence are added by the callout.
- This does not scroll a score, detect a segno location, or invent a bar/section target. The next action stays target-agnostic until a future validated contract carries that association.

## Security Notes

- Attack surface: untrusted song JSON, `dalSegno.label`, and section labels rendered as React text.
- Trust boundary: lexical admission requires an own `label` property before display; inherited, extra-keyed, or malformed values fail closed.
- Mitigations: bounded ASCII Gould tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: D.S. / D.S. 1–9 admission, inherited/extra-key/malformed rejection, target-agnostic restart planning, particle-safe copy fill, and demo Dal Segno plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy name the D.S. action without asserting an unverified target section.

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`dalsegno` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/dalsegno/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
