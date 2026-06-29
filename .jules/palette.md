## 2026-06-29 - Accessible Tooltips for Disabled Elements
**Learning:** Native `title` attributes on `<button>` elements disabled via CSS `pointer-events: none` do not trigger tooltips because pointer events are ignored. Removing `pointer-events: none` breaks modern UI library components.
**Action:** When adding tooltips to disabled buttons, wrap the `<Button>` component in a `<span>` or `<div>` with `tabIndex={0}`, `className="cursor-not-allowed"`, and the `title` attribute.
