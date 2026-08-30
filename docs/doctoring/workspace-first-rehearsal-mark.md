# Tonight's first rehearsal mark

## Decision

The ready rehearsal map names tonight's first stored chart letter so the room can start together at that mark, then checks tonight's first range. This is not MIR rehearsal-letter detection, a bar-number guess, a form tag, or a section label.

## Authority

- Trusted mark is a MusicXML-shaped `{ text }` on `song.rehearsalMark`: one or two uppercase ASCII letters (`A`–`Z`, `AA`–`ZZ`) or a number from `1` through `99` with no leading zero.
- Missing, extra-keyed, lowercase, mixed, padded, or overlong mark fails closed to a stay-on-the-map next action. Do not invent letter A.
- Customer copy names the next action: start together at that mark, then check tonight's first range.

## Trust boundary

- Untrusted input: runtime song roots, `rehearsalMark`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not scroll a score or invent a bar number. The next action is to start together at the named mark, then check the first range.

## Security Notes

- Attack surface: untrusted song JSON, `rehearsalMark.text`, and section labels rendered as React text.
- Trust boundary: lexical admission of own-property `text` before display; inherited, extra-keyed, or malformed values stay guidance-only.
- Mitigations: bounded ASCII letter/number tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: letter/number admission, fail-closed missing and malformed marks, particle-safe copy fill, demo A-letter start plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy both name the next action (start together, then check the first range).

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`rehearsal` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/rehearsal/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
