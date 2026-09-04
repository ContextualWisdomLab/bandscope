# Reduced-motion first-overlap navigation

Workspace map navigation for tonight's first overlap follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstOverlapCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Overlap resolution and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, section, time-range, role, overlap-warning text, and section-local graph metadata are runtime data; inherited properties and arrays masquerading as record metadata are not authority.
- Trust boundary: overlap resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority. The owned overlap-warning string is rendered as a text node and is never rescanned as template syntax. Groove, cue, setup, simplification, and range copy cannot invent a clash.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, `matchMedia` is read-only, scroll targets come from renderer child index, copy interpolation runs once, and the overlap hint is bounded to 180 Unicode code points.
- Test points: inherited song/section/timing/role/graph/warning metadata is rejected, array-backed section records are rejected, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
