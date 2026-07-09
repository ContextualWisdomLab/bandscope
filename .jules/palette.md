
## 2023-10-27 - [Accessibility] Refactoring Disabled Buttons
**Learning:** Wrapped disabled `<button>` elements with `<span>` and `role="button"` along with `aria-hidden="true"` creates invalid nested interactive elements, breaking screen reader functionality and test queries.
**Action:** Always use the native `<button>` element with `aria-disabled="true"` instead of HTML `disabled`. Apply `onClick={(e) => e.preventDefault()}` to block clicks, and place `title` tooltips directly on the button. Ensure tailwind `aria-disabled:` utility variants are used alongside `disabled:` to maintain visual styling.
