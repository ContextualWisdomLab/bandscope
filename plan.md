1. **Design and plan the new feature:**
   - I will add a **"Part Graph Visualization"** (`PartGraphFeature`) feature in a new file `apps/desktop/src/features/part-graph/index.tsx` (and `index.test.tsx` for 100% coverage).
   - This feature will render the `partGraph` defined in `RehearsalSection`.
   - The UI will iterate over `song.sections` and for each section, display a visual representation of `handoff_from` and `handoff_to`.
   - I will hook this feature up to the `App.tsx` or expose it similar to `ChordsFeature` and `RangesFeature`. Wait, `ChordsFeature` and `RangesFeature` are not even used in `App.tsx`? Let me check where `ChordsFeature` is imported.
