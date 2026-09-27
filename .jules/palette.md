## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-09-27 - Custom Tooltip Requires Provider Context
**Learning:** Shadcn/Radix custom `Tooltip` components universally require a `TooltipProvider` context to function in this codebase unless the component export internally wraps it. Using `Tooltip` directly without a provider will crash the application and break unit tests with a missing context error.
**Action:** When replacing native `title` attributes with custom `Tooltip` components, always ensure they are wrapped in a `<TooltipProvider>` or confirm the exported component already handles the provider. In this case, `TooltipProvider` must be used to wrap the tooltips.
