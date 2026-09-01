# Reduced-motion first part-handoff navigation

When `prefers-reduced-motion: reduce` matches, `FirstPartHandoffCallout` scrolls the renderer-owned destination song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

The handoff is a source-to-next-section transition, not a same-section relationship: the source graph supplies the active giver plus corroborated `handoff_to` / `handoff_from` evidence, while the immediately following destination must show the giver deactivated and receiver active. Open names the giving part, receiving part, destination label, and destination start time, then navigates by the renderer-owned destination index. Analysis `section.id` is never DOM-ID authority. This map next-action is distinct from the labeled `handoff` form (#937) and the Part Handoff Map visualization (#850).
