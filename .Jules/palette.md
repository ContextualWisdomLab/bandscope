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

## 2024-06-29 - 비활성화된 네이티브 버튼의 툴팁 차단
**Learning:** 네이티브 `<button>` 요소에 `disabled` 속성을 사용하면 마우스 호버 이벤트를 포함한 포인터 이벤트가 완전히 차단되어 표준 HTML `title` 속성이 툴팁으로 표시되지 않으며, 키보드 탭 순서(tab order)에서도 제외됩니다.
**Action:** "출시 예정" 등 설명 툴팁이 필요한 비활성화된 액션 버튼의 경우, `title`을 버튼에 직접 붙이는 대신 포커스 가능한 `span` (`<span tabIndex={0} title={...} role="button" aria-disabled="true">`)으로 버튼을 감싸서 시각적 및 스크린 리더 접근성을 모두 보장해야 합니다.

## 2024-07-01 - Testing components with focusable disabled button wrappers
**Learning:** When native disabled buttons are wrapped in a focusable `span` to provide accessible tooltips, tests that previously found and clicked the `button` (by temporarily removing the `disabled` attribute) may fail or become overly complex. It is cleaner and more accurate to query the wrapper element (e.g. via its `title`) and fire events on it, reflecting the actual accessible DOM structure.
**Action:** When testing UI components that wrap disabled buttons in a focusable span for accessibility (e.g., using a tooltip/title), use `screen.getByTitle(...)` to query the wrapper element for interactions like `fireEvent.click` rather than `screen.getByRole('button')`.
## 2026-07-06 - 스크린 리더 텍스트 접근성 및 ARIA 속성 주의점
**Learning:** 비활성화된 버튼을 `span`으로 감싸 툴팁을 제공할 때, `role="button"`과 `aria-disabled="true"` 속성이 적용된 상태에서 시각적으로 숨겨진 스크린 리더 전용 텍스트(`sr-only`)를 자식 요소로 추가하면 화면 리더기에서 툴팁 내용이 중복해서 읽히거나 혼란을 줄 수 있습니다. 반대로, 포커스 가능하게 만든 엘리먼트에 역할(role)이 없는 상태로 `tabIndex={0}`만 있으면 접근성에 어긋납니다. 기존 구현의 의도를 정확히 파악하여 ARIA 속성 유지 여부를 신중하게 결정해야 합니다.
**Action:** 접근성 개선 작업 시 기존 구현의 `role`과 `aria-disabled` 속성을 임의로 삭제하지 말고, 스크린 리더에서 읽어주는 기존 텍스트(예: `title` 속성이나 `aria-label`)와 충돌하거나 중복을 초래하는 `sr-only` 텍스트 추가를 피해야 합니다.
