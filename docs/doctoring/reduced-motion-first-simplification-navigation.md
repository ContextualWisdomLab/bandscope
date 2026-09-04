# Reduced-motion first-simplification navigation

Workspace map navigation for tonight's first simpler take follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstSimplificationCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Simplification resolution and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, section, time-range, role, part-graph, and `simplification` strings are runtime data; inherited properties, accessors, setup notes, cues, overlap warnings, and arrays masquerading as record metadata are not authority.
- Trust boundary: simplification resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority. The hint is rendered as a separate text node and is never rescanned as template syntax.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, hints are trimmed and bounded, `matchMedia` is read-only, scroll targets come from renderer child index, and copy interpolation runs once.
- Test points: inherited song/section/timing/role/graph/simplification metadata is rejected, array-backed section records are rejected, setup notes and cues cannot invent a simpler take, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
