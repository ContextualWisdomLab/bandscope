## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2026-09-14 - Use Native HTML disabled for Pagination Boundary Controls
**Learning:** The previous assumption that native `disabled` completely hides elements from screen readers was overly broad. While it removes elements from sequential focus (tab order), screen reader browse behavior varies. WAI-ARIA APG explicitly recommends native `disabled` for pagination buttons (like Previous/Next) at boundaries, because the unavailable state is inferable from adjacent navigation context.
**Action:** Restored native HTML `disabled` on pagination controls, aligning with APG guidance for focusability of disabled controls where discoverability of the blocked function isn't required.
