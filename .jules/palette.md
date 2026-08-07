## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2026-08-07 - Score 컴포넌트 버튼의 툴팁 및 접근성 강화
**Learning:** 아이콘만 있는 기능성 버튼(ScoreViewer, ScoreView)들에 적절한 `title` 속성이 없으면 마우스 사용자 및 스크린 리더 사용자에게 기능이 명확히 전달되지 않습니다. 또한, HTML 기본 `disabled` 속성은 이벤트를 모두 차단해 비활성 상태에서의 툴팁 제공을 막습니다. (단, Base UI 같은 서드파티 라이브러리로 감싸진 커스텀 <Button>은 기존 `disabled` prop을 유지해야 합니다.)
**Action:** 기본 HTML `<button>` 요소에는 `aria-disabled="true"`와 `title` 속성을 추가하고 를 활용하여 접근성을 높였으며, 커스텀 `<Button>` 요소들에는 `title` 속성만 추가해 툴팁을 제공했습니다.

## 2026-08-07 - Score 컴포넌트 버튼의 툴팁 및 접근성 강화
**Learning:** 아이콘만 있는 기능성 버튼(ScoreViewer, ScoreView)들에 적절한 `title` 속성이 없으면 마우스 사용자 및 스크린 리더 사용자에게 기능이 명확히 전달되지 않습니다. 또한, HTML 기본 `disabled` 속성은 이벤트를 모두 차단해 비활성 상태에서의 툴팁 제공을 막습니다. (단, Base UI 같은 서드파티 라이브러리로 감싸진 커스텀 <Button>은 기존 `disabled` prop을 유지해야 합니다.)
**Action:** 기본 HTML `<button>` 요소에는 `aria-disabled="true"`와 `title` 속성을 추가하고 `e.preventDefault()`를 활용하여 접근성을 높였으며, 커스텀 `<Button>` 요소들에는 `title` 속성만 추가해 툴팁을 제공했습니다.
