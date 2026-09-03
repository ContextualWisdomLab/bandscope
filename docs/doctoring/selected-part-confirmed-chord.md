# Selected-part confirmed chord

## Product decision

After a named part is selected, the ready rehearsal workspace names that part's first trusted user harmony override and tells the player to lock the room-confirmed chord before the section. The callout stays hidden until a part is selected and stays hidden when the part has no trusted override.

This is selected-part confirmed-chord guidance only. It does not replace:

- song-wide first confirmed chord ownership (`#1002`)
- selected-part entrance cue (`#1150`)
- selected-part first-pass simplification (`#1151`)
- setup-before-entrance (`#910`)
- Active Player (`#961`)
- MIR / known-stem ownership (`#828` / `#770`)

## Buyer-visible next action

- Lead Vocal: **Lead Vocal uses the room's C#m11 in verse. Lock that chord before the verse.**
- Bass Guitar / Keyboard: no callout, because those demo parts have no user harmony override.
- Korean copy keeps Latin role names particle-safe (`Lead Vocal 파트는`).

## Trust boundary

- Untrusted input: in-memory project `manualOverrides`, role identity, section labels, and chord strings.
- Own-property admission only. Inherited `manualOverrides`, throwing `has`/`get` traps, sparse arrays, and non-object members fail closed.
- Only `field: "harmony"` overrides with `source: "user"` and a non-blank, non-`none` chord become buyer copy.
- Only shared canonical section labels (`intro` through `handoff`) become localization authority.
- Duplicate selected-role ids with conflicting display names or conflicting override chords fail closed.
- `fillConfirmedChordCopy` uses own-property token lookup so inherited members such as `toString` cannot render function source, and placeholder-shaped chords stay literal.

## Security Notes

- Attack surface: rehearsal workspace UI copy from in-memory analysis output. No new file, URL, subprocess, IPC, WebView, model, credential, or export path.
- Trust boundary: browser/React state → selector → translated callout.
- Safe failure: missing selection, missing override, malformed runtime evidence, and conflicting copies hide the callout instead of inventing a chord.
- Privacy: chord symbols and role names remain rehearsal display data already present in the project; nothing is logged or exported by this slice.
- Test points: demo Lead Vocal override, hidden-until-selected, missing/`none` overrides, inherited/model overrides, conflicting copies, sparse collections, getter traps, non-canonical labels, and literal placeholder-shaped chords.
