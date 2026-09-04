# Reduced-motion first-ear-check navigation

Workspace map navigation for tonight's first ear check follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstEarCheckCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Ear-check resolution and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, section, time-range, role, confidence marker, and section-local graph metadata are runtime data; inherited properties and arrays masquerading as record metadata are not authority.
- Trust boundary: ear-check resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority. The owned confidence-notes string is rendered as a text node and is never rescanned as template syntax. Groove, cue, setup, simplification, overlap, and range copy cannot invent an ear check. High confidence is not an ear check.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, `matchMedia` is read-only, scroll targets come from renderer child index, copy interpolation runs once, and the ear-check hint is bounded to 180 Unicode code points.
- Test points: inherited song/section/timing/role/graph/confidence metadata is rejected, array-backed section records are rejected, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
