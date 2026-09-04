# Reduced-motion first-intro navigation

Workspace map navigation for tonight's first intro follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstIntroCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Intro resolution, action-mode authority, and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, section, time-range, role, and section-local graph metadata are runtime data; inherited properties and arrays masquerading as record metadata are not authority.
- Trust boundary: intro resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, `matchMedia` is read-only, scroll targets come from renderer child index, and copy interpolation runs once.
- Test points: inherited song/section/timing/role/graph metadata is rejected, array-backed section records are rejected, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
