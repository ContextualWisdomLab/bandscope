# Reduced-motion first-verse navigation

Workspace map navigation for tonight's first verse follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstVerseCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Verse resolution, action-mode authority, and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, section, and role identifiers are used as copy values, local completion-state identity, and effect dependencies; they are not DOM-ID authority.
- Trust boundary: renderer-owned song-structure children; analysis `section.id` is never DOM-ID authority.
- Mitigations: `matchMedia` is read-only, scroll targets come from renderer child index, and copy interpolation runs once.
- Test points: reduced-motion scroll uses `auto`; default motion uses `smooth`.
