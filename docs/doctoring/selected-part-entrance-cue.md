# Selected-part entrance cue

## Decision

After a named part is selected, the ready rehearsal workspace names that part's first trusted `cue` as the next entrance action:

- **lyric** — listen for the lyric, then enter;
- **count** — count the cue, then enter;
- **transition** — catch the transition, then enter.

When the selected part has no trusted cue, the callout still names the next action: confirm the lyric, count, or transition before the first entrance. The callout stays hidden until a part is selected so this lane does not become a song-wide first-lyric, first-count, or first-transition product.

This is not Active Player ownership (`#961`) and not MIR ownership (`#828` / `#770`).

## Own-property admission

`cue.kind` and `cue.value` are untrusted project fields. Workspace copy may only name an entrance from own-property evidence:

- `cue` must be an owned object;
- `kind` must be an owned `lyric`, `count`, or `transition` string;
- `value` must be meaningful text (not blank or `none`);
- section labels must belong to shared `SECTION_FORM_LABELS`;
- unnamed roles, duplicate ids in one section, or the same id with two display names fail closed.

The helper never logs cue text, role names, or project paths.

## Security Notes

### Attack surface

Untrusted local project JSON can carry `sections[].roles[].cue`. A prototype-inherited `cue` or `kind`, an unknown kind, or a `none` sentinel must not become entrance authority or be interpolated into bilingual copy.

### Trust boundary

Admission is lexical and own-property only. The helper reads in-memory song objects already loaded by the desktop shell. It does not open files, resolve paths, call IPC, or export bytes. Display names interpolated into copy are the same named-role strings already shown in the Role Switcher.

### Mitigations

- `Object.prototype.hasOwnProperty.call` before reading `cue`, `kind`, `value`, `id`, `name`, `label`, and `roles`.
- `meaningfulRangeText` rejects blank and `none` sentinel values.
- Unknown kinds and non-canonical section labels never become buyer-visible localization authority.
- Conflicting section copies of the same named part return `unavailable`; Workspace still tells the player to confirm the entrance instead of guessing.
- Locale templates keep `{roleName}` / `{sectionLabel}` / `{value}` placeholders; `fillRangeCopy` uses own-property token lookup so inherited members such as `toString` cannot render function source.
- Korean copy uses `{roleName} 파트` so a Latin role label cannot produce `Bass Guitar으로`.

### Test points

- Helper: lyric/count/transition; missing selection; blank/`none`/unknown kind; inherited cue and kind; duplicate ids; conflicting names; non-canonical labels; first untrusted canonical copy is not skipped.
- Workspace: hidden until a part is selected; bass transition copy; vocal lyric copy; Korean particle-safe Latin role; unavailable copy when the cue is `none`.

### Realistic threats

A crafted project that puts `cue` on `Object.prototype` or labels a section `drop-D intro` could otherwise tell a player to enter on hostile text or interpolate unexpected function source into the callout.

### Remaining risk

Cue text is already shown on the Section Roadmap card. This callout reuses the same admitted strings for the selected part only and does not persist a new field.

## Verification

Run:

```bash
npm --workspace @bandscope/desktop exec vitest run \
  src/features/workspace/firstEntranceCue.test.ts \
  src/features/workspace/Workspace.entrance-cue.test.tsx \
  src/features/workspace/Workspace.test.tsx
```
