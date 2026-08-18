## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-08-18 - Tooltips on Icon-Only Buttons
**Learning:** Users who navigate with a mouse lack context for icon-only buttons unless they have visible tooltips, whereas screen readers utilize aria-label.
**Action:** Always provide a title attribute that matches the aria-label on all icon-only buttons. Ensure tests verify the presence of both attributes.
## 2024-08-18 - Out-of-Scope Security Dependency Fixes
**Learning:** Fixing security vulnerabilities in dependencies (like Trivy findings for `pdfjs-dist`) that are out of scope for the PR's original goal (e.g., adding `title` attributes for accessibility) should be strictly avoided. Security dependency updates belong in dedicated security PRs.
**Action:** Do not mix security dependency bumps (e.g. `npm audit fix`) with micro-UX enhancement PRs. If Trivy or security audits fail on existing vulnerabilities, verify that it's an existing issue and not caused by the new changes, and leave it to a security-focused agent or separate task.
