# Reduced-motion first setup-note navigation

When `prefers-reduced-motion: reduce` matches, `FirstSetupNoteCallout` scrolls the renderer-owned song-structure section with `behavior: "auto"`. Otherwise it uses `behavior: "smooth"`.

Open still names the owning part, labeled section, and time. Analysis `section.id` is never DOM-ID authority.
