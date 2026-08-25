## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2024-05-19 - Add native tooltips via the `title` attribute for icon-only buttons
**Learning:** Icon-only buttons often have an `aria-label` for screen reader accessibility, but lack visual tooltips for mouse users, leaving them to guess the button's action.
**Action:** Consistently add the `title` attribute along with `aria-label` to icon-only buttons (like Zoom In/Out, Pagination, or Remove) to ensure mouse users get immediate visual feedback on hover, maintaining usability across different interaction methods.
