## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-07-24 - Tooltips for icon-only buttons
**Learning:** Icon-only buttons (like those using `lucide-react` icons) with an `aria-label` are accessible to screen readers, but mouse/sighted users miss out on this context, reducing usability.
**Action:** Always add a `title` attribute matching the `aria-label` to icon-only buttons to provide native browser tooltips on hover.
