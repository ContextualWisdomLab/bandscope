So `ChordsFeature` and `RangesFeature` are standalone components in the codebase that don't seem to be explicitly imported into the main application shell (`App.tsx` or `Workspace.tsx`). This might be because the previous task just asked to implement those features and add 100% tests for them, without explicitly hooking them up to the UI, or they are meant for future use.

I will implement a **`PartGraphFeature`** in `apps/desktop/src/features/part-graph/index.tsx` (and `index.test.tsx`).
Additionally, to add more value, I will also implement a **Tempo Badge Feature** but wait, `CHANGELOG.md` says that tempo badge was already added:
`- Display the analyzed song tempo (BPM) as a badge in the rehearsal workspace.`
Yes, I saw it in `Workspace.tsx`:
```tsx
                {song.tempo && (
                  <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-0.5 text-[0.65rem] font-bold text-cyan-100">
                    {t("workspaceTempoLabel")}: {song.tempo} BPM
                  </span>
                )}
```

Let's look at what else I could add.
How about a **`CollaborationFeature`** view? Or an **"Export Summaries Viewer"**? Or **"Score Attachments List"**?
`RehearsalSong` has `scoreAttachments?: ScoreAttachment[];`.

Actually, `PartGraphFeature` is a great idea. It fits perfectly.
Let's see the schema for `PartGraphNode`:
```typescript
export type PartGraphNode = {
  role_id: string;
  is_active: boolean;
  handoff_to: string[];
  handoff_from: string[];
};
```
I will create a component `apps/desktop/src/features/part-graph/index.tsx` and test `apps/desktop/src/features/part-graph/index.test.tsx`.
I will also add `PartGraphFeature` to the exports or just create it as requested.

But the prompt says: "필요한 기능이 수없이 없다. 스스로 기획하고 스스로 설계해서 스스로 만들어라."
To make it more visible, I could actually integrate `PartGraphFeature` into `Workspace.tsx`! That would be much more impactful than an unused component.
Where in `Workspace.tsx`?
I can add a new section in the workspace for "Part Handoffs" or "Role Activity Map".

Let's look at `Workspace.tsx` layout:
It has:
- Metric Cards
- `SongStructure` component (the timeline)
- Role Switcher
- `SectionRoadmap`

I could add `PartGraphMap` inside the active role details, showing the active role's handoffs!
In `Workspace.tsx`, we have:
```tsx
                <PracticeProgress progress={activeRoleDetails?.practiceProgress} onChange={handlePracticeProgressChange} />
                <GrooveMap notes={activeRoleDetails?.transcription} isLoading={false} />
```
I can add `<PartGraphMap song={song} activeRoleId={activeRole} />` right there!

Wait, `PartGraphMap` component will display the handoff graph for the `activeRole` across all sections.
In each section, it checks if `activeRole` is active.
If it is active, it shows `handoff_from` and `handoff_to`.

Let's design `PartGraphMap.tsx` in `apps/desktop/src/features/workspace/PartGraphMap.tsx`.
It will receive `song` and `activeRoleId`.
It will render a horizontal list of sections (or a vertical one) showing:
- Section Label
- Is active?
- Handoff from: [Role Names]
- Handoff to: [Role Names]

This provides clear value to the user: "When do I play, and who do I pass the baton to?"
