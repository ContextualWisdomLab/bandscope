## 2026-06-12 - Screen reader support for non-interactive elements with icons
**Learning:** Adding a `title` attribute to a non-interactive element like a `<div>` is often insufficient for screen readers to properly announce the context. Even if it provides a visual tooltip, an icon inside an otherwise empty `div` will be inaccessible.
**Action:** When adding descriptive tooltips to non-interactive elements, include visually hidden text (`<span className="sr-only">`) to ensure screen readers announce the meaning accurately.
