# Reduced-motion first-approval navigation

Workspace map navigation for tonight's first pending approval follows the operating-system reduced-motion preference.

When `prefers-reduced-motion: reduce` matches, `FirstApprovalCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

This is a presentation contract only. Approval resolution and analysis-id isolation stay unchanged.

## Security Notes

- Untrusted input: song, collaboration, approval identity/owner/scope/status, section, time-range, and form-label tokens inside an owned scope are runtime data; inherited properties and arrays masquerading as record metadata are not authority.
- Trust boundary: approval resolution accepts required fields only when the inspected record owns them, while renderer-owned song-structure children remain the only navigation targets; analysis `section.id` is never DOM-ID authority. The owned approval scope is interpolated once as copy and is never rescanned as template syntax. Assignments, comments, and already-approved scopes cannot invent a pending approval. Canonical English form-label tokens may uniquely name a section; Korean or free-text scope copy cannot invent navigation.
- Mitigations: runtime record guards reject arrays, dense collections require own indexed elements, required metadata fields must be own properties, `matchMedia` is read-only, scroll targets come from renderer child index, copy interpolation runs once, and the approval scope is bounded to 180 Unicode code points.
- Test points: inherited song/collaboration/approval/section/timing metadata is rejected, array-backed section records are rejected, reduced-motion scroll uses `auto`, and default motion uses `smooth`.
