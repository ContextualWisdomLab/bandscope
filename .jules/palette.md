## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2026-10-04 - Accessible Tooltips for Practice Progress
**Learning:** Using native HTML `title` attributes on interactive elements isn't fully accessible for keyboard users.
**Action:** Replace `title` attributes with custom `Tooltip` wrapper components (from Base UI/Radix) on icon-only buttons to ensure full visibility for both mouse hover and keyboard focus events.
