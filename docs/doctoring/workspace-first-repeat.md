# Tonight's first repeat

## Decision

The ready rehearsal map names tonight's first stored repeat so the room can play that passage again at that mark, then checks tonight's first range. This is not MIR repeat detection, a volta ending, OCR, or a section label.

## Authority

- Trusted repeat is a MusicXML-shaped `{ label }` on `song.repeat`: Gould start/end-repeat barlines `|:` and `:|`, or chart play-counts `x2` through `x9`.
- Missing, extra-keyed, spelled-out `repeat`, `2x`, `×2`, `x1`, `x10`, `:||`, `||:`, `D.C.`, `D.S.`, `Fine`, padded, or overlong labels fail closed to a stay-on-the-map next action. Do not invent a repeat.
- Customer copy names the next action: play that passage again at that repeat, start the first named section, then check tonight's first range.

## Trust boundary

- Untrusted input: runtime song roots, `repeat`, and section labels.
- Session display only. No files, URLs, subprocesses, IPC, model artifacts, or persistence.
- This does not scroll a score or invent a bar number. The next action is to play the passage again at the named repeat, then check the first range.

## Security Notes

- Attack surface: untrusted song JSON, `repeat.label`, and section labels rendered as React text.
- Trust boundary: lexical admission of own-property `label` before display; inherited, extra-keyed, or malformed values stay guidance-only.
- Mitigations: bounded Gould/MusicXML tokens; one-shot copy interpolation so rehearsal values are never rescanned as template syntax; no filesystem, network, subprocess, model, or telemetry path added.
- Tests: `|:` / `:|` / `x2`–`x9` admission, fail-closed missing and malformed labels, particle-safe copy fill, demo play-it-again plan.
- Dependency / supply-chain: none. Inherited protected-base npm HIGH findings belong to #783 and are not suppressed here.
- i18n: English and Korean copy both name the next action (play that passage again at the repeat, then check the first range).

## Primary standard

MakeMusic. (2021). *MusicXML 4.0* (`repeat` element). W3C Music Notation Community Group. https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/repeat/

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.
