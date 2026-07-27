## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2025-02-27 - Icon-only button tooltips
**Learning:** Icon-only buttons (like lucide-react icons inside a `<Button>`) need a `title` attribute matching their `aria-label` to display native browser hover tooltips for mouse users, improving accessibility and discoverability.
**Action:** When adding or modifying icon-only buttons, always ensure both `aria-label` (for screen readers) and `title` (for mouse hover) are present and match.
