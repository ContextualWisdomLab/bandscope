## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-08-19 - Accessible Tooltips on Icon-Only Buttons
**Learning:** While `aria-label` ensures screen reader accessibility for icon-only buttons, it leaves mouse/sighted users without context. Adding a `title` attribute matching the `aria-label` provides native browser tooltips on hover, improving discoverability without introducing heavy custom tooltip components.
**Action:** Always include a `title` attribute on icon-only buttons that mirrors the `aria-label` to provide built-in visual hints for mouse users. Ensure tests assert for the presence of the `title` attribute alongside `aria-label`.
