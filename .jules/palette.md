## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2026-08-08 - Adding Tooltips to Icon-Only Buttons
**Learning:** Icon-only buttons lacking `title` attributes may not provide sufficient visual cues on hover, making navigation less intuitive for mouse users. Relying purely on `aria-label` ensures screen reader accessibility but omits visual feedback.
**Action:** When adding `aria-label` to icon-only buttons, always accompany it with a matching `title` attribute to show native browser tooltips on hover.
