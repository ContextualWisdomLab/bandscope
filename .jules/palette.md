## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2024-07-29 - Conditional tabIndex for tooltip wrappers
**Learning:** When wrapping a focusable component (like a custom `<Button>`) with a `<span title="...">` to provide a tooltip for its disabled state, adding `tabIndex={0}` to the wrapper makes the tooltip accessible. However, if applied unconditionally, it creates a "phantom" tab stop when the button is enabled, as both the wrapper and the button receive focus.
**Action:** Always make `tabIndex` on disabled button wrappers conditional (e.g., `tabIndex={isDisabled ? 0 : -1}`) so it is only focusable when the inner button is natively skipped due to being disabled.
