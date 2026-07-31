## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-05-19 - Use Title Attribute for Tooltips on Icon-Only Buttons
**Learning:** Icon-only buttons often have `aria-label` for screen reader accessibility, but this does not provide visual tooltips on hover for sighted mouse users. Relying purely on external Tooltip components can add DOM overhead.
**Action:** Add native HTML `title` attributes (matching the `aria-label`) to icon-only buttons (like those with `size="icon"` or `size="icon-lg"`) to provide immediate, zero-dependency browser tooltips on hover.
