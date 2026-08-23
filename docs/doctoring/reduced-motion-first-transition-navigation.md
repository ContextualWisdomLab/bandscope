# Reduced-motion first-transition navigation

Workspace map navigation for tonight's first owned transition cue follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstTransitionCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Transition resolution and analysis-id isolation stay unchanged. The owned cue text is rendered as a text node and is never rescanned as copy-template syntax.

## Security Notes

- Untrusted input: song, section, time-range, role, section-local graph, and `cue` metadata are runtime data; inherited properties and arrays masquerading as record metadata are not authority.
- Trust boundary: transition resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority. Lyric, count, groove, setup, simplification, overlap, and form-label fields cannot establish a transition.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, cue values are bounded and trimmed, `matchMedia` is read-only, scroll targets come from renderer child index, and copy interpolation runs once on role/time placeholders only.
- Test points: inherited song/section/timing/role/cue/graph metadata is rejected, array-backed section records are rejected, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
