## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2023-10-16 - Base UI Tooltip을 사용할 때의 테스트 주의사항
**Learning:** Base UI 기반의 `Tooltip`을 `delay={0}`으로 사용하면, 상호작용 후 상태 업데이트가 비동기적으로 발생합니다. 이로 인해 테스트(예: `App.test.tsx`의 "clears the YouTube URL without clearing local selection errors and returns focus to the input")에서 "An update to TooltipTrigger inside a test was not wrapped in act(...)" 경고가 발생할 수 있습니다.
**Action:** 단순히 기능이 작동하더라도 테스트의 경고를 방지하려면, 툴팁이 있는 요소와 상호작용하는 테스트 코드를 작성할 때 마우스나 포커스 아웃 이벤트의 타이밍을 맞추거나 `act`로 감싸서 해결해야 합니다. 이번 수정에서는 직접적인 관련은 없지만 향후 테스트 작성 시 유의해야 합니다.
