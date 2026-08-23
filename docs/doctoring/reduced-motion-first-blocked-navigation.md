# Reduced-motion first-blocked navigation

Workspace map navigation for tonight's first blocked assignment follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstBlockedCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Blocked-job resolution and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, collaboration, assignment identity/assignee/summary/status/sectionId/roleId, section, time-range, role, and part-graph tokens are runtime data; inherited properties and arrays masquerading as record metadata are not authority.
- Trust boundary: blocked resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority. The owned assignment summary is interpolated once as copy and is never rescanned as template syntax. Todo, in-progress, ready assignments, comments, and approvals cannot invent a blocked job.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, `matchMedia` is read-only, scroll targets come from renderer child index, copy interpolation runs once, and the assignment summary is bounded to 180 Unicode code points.
- Test points: inherited song/collaboration/assignment/section/timing metadata is rejected, array-backed section records are rejected, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
