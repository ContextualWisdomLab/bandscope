## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2026-08-15 - Enforcing JSDoc on Component Exports
**Learning:** The `@bandscope/desktop` workspace enforces the `jsdoc/require-jsdoc` ESLint rule on exported items. When ESLint attempts to auto-fix missing JSDoc comments, it may inject awkward, disjointed blocks (like `export /** * */ const Component`) that still fail linting or obscure the intended export syntax.
**Action:** When adding new exported components, functions, or interfaces to the frontend, manually write a valid `/** ... */` JSDoc comment immediately preceding the export declaration to satisfy the linter and prevent build-breaking auto-formatting issues.
