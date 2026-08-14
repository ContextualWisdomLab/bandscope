## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-08-14 - Accessible Tooltips for Icon-only Buttons
**Learning:** Icon-only buttons using only `aria-label` are accessible to screen readers, but sighted mouse users miss out on crucial context because no native tooltip is shown.
**Action:** Always add a `title` attribute matching the `aria-label` to icon-only buttons (like Zoom In/Out, Pagination, or Remove actions) to provide a native browser tooltip for mouse users.
