## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2026-09-24 - Accessible tooltips instead of title

**Learning:** When adding tooltips to icon-only buttons, especially those using `aria-disabled={true}`, do not use the native HTML title attribute as it lacks keyboard/touch support.
**Action:** Wrap the element in the custom Tooltip components (@/components/ui/tooltip).
