
## 2023-10-27 - [Accessibility] Refactoring Disabled Buttons
**Learning:** Wrapped disabled `<button>` elements with `<span>` and `role="button"` along with `aria-hidden="true"` creates invalid nested interactive elements, breaking screen reader functionality and test queries.
**Action:** Prefer the native `<button disabled>` for truly inactive actions (removes from tab order and is widely announced by AT). Use `<button aria-disabled="true">` only when you intentionally keep focus/tooltip. In that case, block activation via `onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}` and guard keyboard with `onKeyDown` for Space/Enter; consider `tabIndex={-1}` if you do not want it in tab order. Style with both `disabled:` and `aria-disabled:` variants as needed.

## 2023-10-27 - [A11y] Safe Disabling of Buttons
**Learning:** `aria-disabled` is purely semantic and does not prevent keyboard activation (Enter/Space) or event bubbling by default, potentially causing unintended UI behavior.
**Action:** When using `aria-disabled="true"` to create focusable disabled buttons, strictly enforce behavior by adding `onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}` and `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}`. Always test this behavior in tests checking `defaultPrevented` for both click and keydown events.
