Let's refine the `PartGraphMap` feature.

**Feature Name:** Part Handoff Map (파트 핸드오프 맵)

**Purpose:**
Shows the active player/role when they start playing, when they rest, and who they hand off to or take over from between sections. This is extremely useful for rehearsal (e.g. "I rest during the bridge, then take over from the acoustic guitar in the outro").

**UI Design:**
- A custom React component in `apps/desktop/src/features/workspace/PartGraphMap.tsx`.
- A title: "Handoff & Activity Map" (with translation).
- Maps over `song.sections`.
- For each section, finds the `PartGraphNode` for the `activeRoleId`.
- Displays:
  - Section Name
  - Status: Active (playing) or Resting (inactive).
  - If it has `handoff_from` list -> shows "Takes over from: [Role Names]"
  - If it has `handoff_to` list -> shows "Hands off to: [Role Names]"

**Implementation Steps:**
1. Update `apps/desktop/src/locales/en/common.json` with new translation keys for this feature.
2. Create `apps/desktop/src/features/workspace/PartGraphMap.tsx`.
3. Create `apps/desktop/src/features/workspace/PartGraphMap.test.tsx` ensuring 100% test coverage using React Testing Library.
4. Modify `apps/desktop/src/features/workspace/Workspace.tsx` to include `<PartGraphMap song={song} activeRoleId={activeRole} roleMap={roleMap} />`.
5. Update `CHANGELOG.md` in Korean.
6. Run CI script to ensure 100% test coverage.

Let's check `apps/desktop/src/locales/en/common.json` to see where to add translations.
