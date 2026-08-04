## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2024-05-20 - Adding titles to icon-only buttons
**Learning:** Icon-only buttons (like those with just lucide-react icons) often have `aria-label`s for screen readers but lack tooltips for mouse users, making their function unclear.
**Action:** Always add a `title` attribute matching the `aria-label` to icon-only buttons so standard browser tooltips appear on hover, improving usability for sighted users.
