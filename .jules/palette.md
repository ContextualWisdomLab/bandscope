## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-05-19 - Test Accessibility Interactions Carefully
**Learning:** When using `aria-disabled` for tooltips, ensure `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed` is added to emulate native visual state and prevent user confusion.
**Action:** Add these utility classes whenever converting `disabled` to `aria-disabled`.
