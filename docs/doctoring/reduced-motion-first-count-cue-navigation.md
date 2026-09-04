# Reduced-motion first-count navigation

Workspace map navigation for tonight's first count follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstCountCueCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Count resolution and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, section, time-range, role, cue kind/value, and section-local graph metadata are runtime data; inherited properties and arrays masquerading as record metadata are not authority.
- Trust boundary: count resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority. The owned `cue.kind === "count"` string is rendered as a text node and is never rescanned as template syntax. Lyric, transition, groove, setup, simplification, overlap, and range copy cannot invent an entrance count.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, `matchMedia` is read-only, scroll targets come from renderer child index, copy interpolation runs once, and the count hint is bounded to 180 Unicode code points.
- Test points: inherited song/section/timing/role/graph/cue metadata is rejected, array-backed section records are rejected, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
