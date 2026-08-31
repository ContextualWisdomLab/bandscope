# Practice-progress next action

## Decision

The ready rehearsal workspace already records a 0–100 `practiceProgress` value per named part. A percentage alone does not tell the player what to do next. After a named part is selected, BandScope now names one rehearsal step:

- **start** when the part has not been marked started: check that part's first range, then mark the part started;
- **continue** while the part is still below 100%: keep practicing until it is ready for the room;
- **ready-next** when the selected part is ready and another named part is not: switch to that next unready part and check its range;
- **ready-done** when every named part is ready: download tonight's cue sheet and send it to the group.

This is not a leftover, come-in, tacet, tutti, or MIR product. Canonical MIR ownership remains ContextualWisdomLab/bandscope#828 for ContextualWisdomLab/bandscope#770.

## Own-property admission

`practiceProgress` is a local project field. Workspace copy may only name a next action from own-property evidence:

- a missing `practiceProgress` own property means the part has not been marked started (progress `0`);
- inherited prototype members, non-finite numbers, non-numbers, and values outside `0`–`100` fail closed;
- unnamed roles, duplicate role ids in one section, or the same id with two display names fail closed;
- conflicting section copies of the same named part fail closed so a handoff cannot name the wrong next step.

The helper never logs role names, project paths, or progress values.

## Security Notes

### Attack surface

Untrusted local project JSON can carry `sections[].roles[]` objects. A prototype-inherited `practiceProgress`, a string `"100"`, `NaN`, or disagreeing section copies must not become rehearsal authority or be interpolated into bilingual next-action copy.

### Trust boundary

Admission is lexical and own-property only. The helper reads in-memory song objects already loaded by the desktop shell. It does not open files, resolve paths, call IPC, or export bytes. Display names interpolated into copy are the same named-role strings already shown in the Role Switcher.

### Mitigations

- `Object.prototype.hasOwnProperty.call` before reading `practiceProgress`, `id`, and `name`.
- Finite numeric range `0`–`100` only; missing own property admits `0`.
- `meaningfulRangeText` rejects blank and `none` sentinel names.
- Conflicting section copies return `null`; Workspace omits next-action copy rather than guessing.
- Locale templates keep `{roleName}` / `{nextRoleName}` placeholders; `fillRangeCopy` uses own-property token lookup so inherited members such as `toString` cannot render function source.

### Test points

- Helper: missing vs own-property `0`/`50`/`100`; inherited/non-finite/out-of-range fail closed; start/continue/ready-next/ready-done; skip later ready parts; unnamed or duplicated roles fail closed.
- `PracticeProgress` renders supplied next-action copy through `data-testid="practice-progress-next-action"`.
- Workspace English copy: select bass at 0 → start; bass at 50 → continue; bass at 100 → Keyboard 1 Right Hand; every part at 100 → cue-sheet send; conflicting section copies hide the copy.

### Realistic threats

A crafted project that puts `practiceProgress: 100` on `Object.prototype` or disagrees across sections could otherwise tell a player a part is ready, skip a still-unready named part, or interpolate unexpected text into the tracker.

### Remaining risk

The tracker still writes the same percentage onto every section copy of the selected role through the existing Workspace updater. That write path is unchanged. Next-action copy is derived, not persisted, and is omitted when admission fails.

## Verification

Run:

```bash
npm --workspace @bandscope/desktop exec vitest run \
  src/features/workspace/practiceProgressNextAction.test.ts \
  src/features/workspace/PracticeProgress.test.tsx \
  src/features/workspace/Workspace.test.tsx
```
