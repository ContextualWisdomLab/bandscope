## 2024-05-19 - Native disabled and aria-disabled serve different accessibility needs
**Learning:** Native HTML `disabled` controls are not focusable and leave the tab order, and user activation such as clicks is suppressed. They are not correctly described as completely hidden from assistive technology, and pointer/hover behavior should not be generalized across browsers and event types. `aria-disabled="true"` keeps disabled semantics without changing focusability or suppressing behavior automatically.
**Action:** Prefer native `disabled` for native form controls when the action should be unavailable. Use `aria-disabled="true"` only when a disabled action intentionally needs to remain discoverable in keyboard navigation, and then suppress activation in application code and provide a real accessible explanation; do not rely on `title` alone for screen-reader guidance.

## 2024-05-18 - Added focus visible styles for keyboard navigation
**Learning:** Interactive inline buttons (like the chord editor) and scrollable regions with `tabIndex={0}` do not automatically get focus visible styles, meaning keyboard users tabbing through won't know they are focused on them. Unlike central `<Button />` components which bake focus states in, these custom inline interactive elements need explicit focus styling.
**Action:** Always add explicit focus visible styles (e.g., `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300`) to custom interactive elements and scrollable regions with `tabIndex={0}` for proper keyboard accessibility.

## 2024-05-24 - Visual tooltips for disabled icon-only buttons
**Learning:** Icon-only buttons with `aria-label` are accessible to screen readers, but sighted users relying on mouse hover don't get context if the `title` attribute is missing, especially when the button is disabled and its purpose is unclear (e.g. "coming soon").
**Action:** Always add a `title` attribute mirroring the `aria-label` (or providing a specific disabled reason) to icon-only buttons so sighted users also receive explanatory tooltips on hover.

## 2026-06-13 - Added screen reader text for tooltip divs
**Learning:** When using `title` attributes on non-interactive elements like icon-only `div`s for tooltips, screen readers might not announce them properly because they aren't focusable. The visual tooltip is not enough for accessibility.
**Action:** Always add a visually hidden `<span className="sr-only">[Tooltip Text]</span>` inside non-interactive elements that rely on a `title` attribute so that screen readers have text content to announce.

## 2026-06-18 - Added keyboard accessibility to scrollable regions
**Learning:** Horizontally scrollable regions (like the `SectionRoadmap` component) are not accessible to keyboard-only users unless they can receive focus. Keyboard users must be able to focus the container to scroll its content using arrow keys.
**Action:** For proper keyboard accessibility in custom scrollable regions, always include `tabIndex={0}`, an appropriate `aria-label`, `role="region"`, and explicit focus visible styling (e.g., `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300`).

## 2026-06-19 - Internationalization
**Learning:** The desktop app uses i18n via json files located in `apps/desktop/src/locales/`
**Action:** When adding new text strings, make sure to add it to all locale files.

## 2026-06-25 - Native tooltips on disabled elements
**Learning:** Standard HTML `title` attributes used as tooltips do not render on elements that use Tailwind's `pointer-events-none` class, which is often applied to `disabled:` variants in Base UI and styled components.
**Action:** Do not rely on native `title` attributes for explaining disabled states on buttons with `pointer-events-none`. Instead, either use a custom tooltip component or ensure focus/interactive styles are preserved if an explanation is strictly required.

## 2024-06-29 - 비활성화된 네이티브 버튼의 설명 제공
**Learning:** 네이티브 `<button disabled>`는 포커스를 받을 수 없어 키보드 탭 순서에서 제외되고 사용자 활성화가 차단됩니다. 보조기술에는 disabled 상태로 전달될 수 있으며, `title` 툴팁이나 포인터/호버 동작은 브라우저와 이벤트 종류에 따라 달라질 수 있으므로 모든 포인터 이벤트가 차단된다고 일반화하지 않습니다.
**Action:** 비활성 액션의 이유가 모든 사용자에게 필요하면 `title`만 의존하지 말고 화면에 보이는 설명 또는 `sr-only` 등 실제 접근 가능한 텍스트를 제공하세요. 툴팁을 위해 네이티브 버튼을 wrapper로 감싸야 하더라도 wrapper에 `role="button"`을 부여해 중첩 버튼 의미를 만들지 마세요. disabled 액션을 의도적으로 탭 순서에 남겨야 하는 경우에만 `aria-disabled="true"` 패턴을 사용하고, 애플리케이션 코드에서 활성화를 직접 차단하세요.

## 2024-07-01 - Testing components with focusable disabled button wrappers
**Learning:** When native disabled buttons are wrapped in a focusable `span` to provide accessible tooltips, tests that previously found and clicked the `button` (by temporarily removing the `disabled` attribute) may fail or become overly complex. It is cleaner and more accurate to query the wrapper element (e.g. via its `title`) and fire events on it, reflecting the actual accessible DOM structure.
**Action:** When testing UI components that wrap disabled buttons in a focusable span for accessibility (e.g., using a tooltip/title), use `screen.getByTitle(...)` to query the wrapper element for interactions like `fireEvent.click` rather than `screen.getByRole('button')`.

## 2024-05-24 - Avoid nesting native buttons with ARIA role button on wrappers
**Learning:** Adding `role="button"` to a `span` or `div` wrapper that contains a native `<button>` element inside violates ARIA specifications. Interactive roles (like `button`) must not contain other interactive elements (even if the inner element is disabled or has `aria-hidden`), as this causes invalid/redundant accessibility trees and screen reader confusion.
**Action:** Always verify wrappers used to implement tooltips for disabled buttons are standard elements (e.g., `<span tabIndex={0} title="...">`) but *do not* assign `role="button"` to the wrapper itself.

## 2026-07-02 - Inline clear buttons preserve focus
**Learning:** Inline clear buttons often unmount immediately after clearing state, which can drop keyboard focus to the document body.
**Action:** Move focus back to the owning input before clearing state, and cover the behavior with a DOM focus test.