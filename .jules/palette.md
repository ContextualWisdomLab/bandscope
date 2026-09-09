## 2026-09-09 - Accessible Tooltips on Disabled Elements
**Learning:** Native `title` attributes on `disabled` or `aria-disabled` elements do not reliably announce content to screen readers or display visually across all browsers in a consistent manner, especially for icon-only buttons.
**Action:** When creating icon-only buttons that may be disabled, use `aria-disabled="true"` instead of the native `disabled` attribute so they can remain focusable, and wrap them in a custom, accessible `Tooltip` component from the design system to clearly explain the disabled state (e.g., "Coming soon").
