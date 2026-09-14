## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2026-09-14 - Replace HTML disabled with aria-disabled="true" for Score Viewer Pagination Tooltips
**Learning:** The score viewer prev/next buttons used HTML 'disabled', dropping them from screen reader flow and blocking helpful 'Why is this disabled?' tooltips.
**Action:** Switched to 'aria-disabled="true"' and added contextual title tooltips ('Already at the first/last page') so users understand why navigation is blocked without losing element focus.
