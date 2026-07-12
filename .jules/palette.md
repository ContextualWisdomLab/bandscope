
## 2026-07-12 - Accessible Disabled Button Tooltips
**Learning:** To make disabled buttons accessible and their tooltips functional, wrapping them in a `span role="button"` or applying `aria-hidden="true"` creates invalid nested interactive elements and breaks screen reader accessibility.
**Action:** Use the native `<button>`, remove the HTML `disabled` and `pointer-events-none` attributes, apply `aria-disabled="true"`, block clicks with `onClick={(e) => e.preventDefault()}`, place the `title` attribute directly on the button, and add `aria-disabled` styles to the button components in Tailwind variants.
