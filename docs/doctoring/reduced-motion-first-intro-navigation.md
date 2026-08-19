# Reduced-motion first-intro navigation

Workspace map navigation for tonight's first intro follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstIntroCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Intro resolution, action-mode authority, and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: rehearsal section and role identifiers used only as React keys and copy values.
- Trust boundary: renderer-owned song-structure children; analysis `section.id` is never DOM-ID authority.
- Mitigations: `matchMedia` is read-only, scroll targets come from renderer child index, and copy interpolation runs once.
- Test points: reduced-motion scroll uses `auto`; default motion uses `smooth`.
