## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2025-02-19 - Do not replace disabled prop in shared UI components
**Learning:** Native `<button>` accessibility requires `aria-disabled` and conditional `onClick` handlers, but shared design system `<Button>` components (which wrap external primitives) may break if their native `disabled` prop is replaced.
**Action:** When updating elements for accessibility, exclusively modify native HTML buttons, leaving existing shared `<Button>` elements (e.g., from `@base-ui`) intact to prevent visual regressions.
