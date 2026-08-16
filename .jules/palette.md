## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2024-08-16 - Add tooltips to icon-only buttons
**Learning:** Icon-only buttons often have an `aria-label` for screen reader users, but without a `title` attribute, mouse users hovering over the button receive no visual hint about its function, degrading usability.
**Action:** Always add a `title` attribute matching the `aria-label` to icon-only buttons to provide native browser tooltips on hover.
