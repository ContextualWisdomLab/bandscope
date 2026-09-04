# Selected-part first-pass take

## Decision

After a named part is selected, the ready rehearsal workspace names that part's first trusted `simplification` as the next first-pass action: play the simpler take before adding the rest.

When the selected part has no trusted simplification, the callout still names the next action: confirm the simpler version before the first run. The callout stays hidden until a part is selected so this lane does not become a song-wide first-simpler-take product.

This is not Active Player ownership (`#961`) and not MIR ownership (`#828` / `#770`).

## Own-property admission

`simplification` is an untrusted project field. Workspace copy may only name a first-pass take from own-property evidence:

- `simplification` must be an owned string;
- the value must be meaningful text (not blank or `none`);
- section labels must belong to shared `SECTION_FORM_LABELS`;
- unnamed roles, duplicate ids in one section, or the same id with two display names fail closed.

The helper never logs simplification text, role names, or project paths.

## Security Notes

### Attack surface

Untrusted local project JSON can carry `sections[].roles[].simplification`. A prototype-inherited `simplification` or a `none` sentinel must not become first-pass authority or be interpolated into bilingual copy.

### Trust boundary

Admission is lexical and own-property only. The helper reads in-memory song objects already loaded by the desktop shell. It does not open files, resolve paths, call IPC, or export bytes. Display names interpolated into copy are the same named-role strings already shown in the Role Switcher.

### Mitigations

- `Object.prototype.hasOwnProperty.call` before reading `simplification`, `id`, `name`, `label`, and `roles`.
- `meaningfulRangeText` rejects blank and `none` sentinel values.
- Non-canonical section labels never become buyer-visible localization authority.
- Conflicting section copies of the same named part return `unavailable`; Workspace still tells the player to confirm the first-pass take instead of guessing.
- Locale templates keep `{roleName}` / `{sectionLabel}` / `{value}` placeholders; `fillRangeCopy` uses own-property token lookup so inherited members such as `toString` cannot render function source.
- Korean copy uses `{roleName} 파트` so a Latin role label cannot produce `Bass Guitar으로`.

### Test points

- Helper: bass/keys/vocal takes; missing selection; blank/`none`/missing field; inherited simplification; duplicate ids; conflicting names; non-canonical labels; first untrusted canonical copy is not skipped.
- Workspace: hidden until a part is selected; bass first-pass copy; vocal first-pass copy; Korean particle-safe Latin role; unavailable copy when the take is `none`.

### Realistic threats

A crafted project that puts `simplification` on `Object.prototype` or labels a section `drop-D intro` could otherwise tell a player to play hostile text or interpolate unexpected function source into the callout.

### Remaining risk

Simplification text is already shown on the Section Roadmap card. This callout reuses the same admitted strings for the selected part only and does not persist a new field.

## Verification

Run:

```bash
npm --workspace @bandscope/desktop exec vitest run \
  src/features/workspace/firstPassSimplification.test.ts \
  src/features/workspace/Workspace.first-pass.test.tsx \
  src/features/workspace/Workspace.test.tsx
```
