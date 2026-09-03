# Selected-part confirmed chord

## Product decision

After a named part is selected, the ready rehearsal workspace names that part's first trusted user harmony override and tells the player to lock the room-confirmed chord before the section. The callout stays hidden until a part is selected and stays hidden when the part has no trusted override.

This is selected-part confirmed-chord guidance only. It does not replace:

- song-wide first confirmed chord ownership (`#1002`)
- selected-part entrance/first-pass guidance owned by the canonical `#1150` vertical
- setup-before-entrance (`#910`)
- Active Player (`#961`)
- MIR / known-stem ownership (`#828` / `#770`)

## Buyer-visible next action

- Lead Vocal: **Lead Vocal uses the room's C#m11 in verse. Lock that chord before the verse.**
- Bass Guitar / Keyboard: no callout, because those demo parts have no user harmony override.
- Korean copy avoids attaching a case particle directly to arbitrary chord notation: **verse의 Lead Vocal 파트는 방이 확인한 C#m11 코드로 맞춥니다. verse 전에 그 코드를 고정하세요.**

## Trust boundary

- Untrusted input: in-memory project `manualOverrides`, role identity, section labels, and chord strings.
- Own-property admission only. Inherited `manualOverrides`, throwing `has`/`get` traps, sparse arrays, and non-object members fail closed.
- Only `field: "harmony"` overrides with `source: "user"` and a non-blank, non-`none` chord become buyer copy.
- Every valid user harmony override on the selected role is inspected. Repeated copies of the same chord are harmless; two different admitted chords on the same role are ambiguous and fail closed instead of choosing by array order.
- Only shared `SECTION_FORM_LABELS` become localization authority.
- Duplicate selected-role ids with conflicting display names or conflicting override chords across section copies fail closed.
- `fillConfirmedChordCopy` uses own-property token lookup so inherited members such as `toString` cannot render function source, and placeholder-shaped chords stay literal.

## Security Notes

- Attack surface: rehearsal workspace UI copy from in-memory analysis output. No new file, URL, subprocess, IPC, WebView, model, credential, or export path.
- Trust boundary: browser/React state → selector → translated callout.
- Safe failure: missing selection, missing override, malformed runtime evidence, and conflicting same-role or cross-section copies hide the callout instead of inventing a chord.
- Privacy: chord symbols and role names remain rehearsal display data already present in the project; nothing is logged or exported by this slice.
- Test points: demo Lead Vocal override, hidden-until-selected, missing/`none` overrides, inherited/model overrides, conflicting copies, same-role conflicting user overrides, duplicate identical user overrides, sparse collections, getter traps, non-canonical labels, literal placeholder-shaped chords, and particle-safe Korean chord copy.
