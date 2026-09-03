## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2026-09-03 - Explaining Disabled UI States
**Learning:** Screen readers and sighted users benefit from knowing *why* an element is disabled, not just that it is disabled. Repeating the action (e.g. "Decrease progress") on a disabled button is unhelpful and confusing for accessibility.
**Action:** When setting `aria-disabled="true"`, update the `aria-label` and `title` to explain the boundary condition (e.g. "Already at 0%") rather than reusing the active state's action label.
