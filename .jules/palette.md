
## 2024-07-05 - ARIA spec on nested interactive elements
**Learning:** Native disabled `<button>` elements wrapped in a focusable `span` to provide accessible tooltips should not have `role="button"` or `aria-disabled="true"` on the wrapper `span`. According to ARIA specifications, interactive roles must not contain other interactive elements (even if disabled or aria-hidden).
**Action:** When wrapping a disabled native button in a focusable tooltip `span`, simply use `tabIndex={0}` and `title` with a visually hidden child element (`<span className="sr-only">...</span>`) for screen readers, and do not add `role="button"` to the wrapper.
