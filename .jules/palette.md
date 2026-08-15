## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-05-19 - Use `aria-disabled` for Pagination Controls in ScoreViewer
**Learning:** Native `disabled` attributes on previous/next pagination buttons prevent screen reader users from discovering that additional pages exist but are currently unavailable.
**Action:** Replace `disabled` with `aria-disabled="true"`, block clicks with `onClick={(e) => e.preventDefault()}`, and add native `title` tooltips to maintain accessibility for both keyboard navigation and mouse users.
