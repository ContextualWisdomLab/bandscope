## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2024-05-19 - Duplicate PR Rejection (aria-disabled improvements)
**Learning:** PRs addressing disabled button tooltips/accessibility were superseded because another broader PR (#731) already implemented the same changes with more comprehensive coverage (including `aria-describedby` linkage, visible styling, and robust tests).
**Action:** Before proposing similar broad accessibility sweeps, check existing open PRs to avoid duplicating work and creating merge conflicts. If superseded, acknowledge the closure and stop work on the PR.
