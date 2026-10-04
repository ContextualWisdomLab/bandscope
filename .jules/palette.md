## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2026-10-04 - Add Tooltips to Icon-Only Buttons
**Learning:** aria-label alone is sufficient for screen readers, but sighted mouse/keyboard users miss out on the meaning of icon-only buttons. Tooltips bridge this accessibility gap for non-screen-reader users.
**Action:** Always wrap icon-only buttons with Tooltip components to ensure both screen reader support (via aria-label) and visual support (via TooltipContent).
