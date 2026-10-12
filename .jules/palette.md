## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2024-10-12 - 다이얼로그 닫기 버튼 툴팁 접근성 개선
**Learning:** Base UI 기반의 `DialogPrimitive.Close`와 같은 기본 요소에 툴팁을 추가할 때, 중첩된 `<button>` 렌더링을 방지하고 접근성을 확보하기 위해서는 `<TooltipTrigger>`의 `render` prop을 사용해 합성을 수행해야 합니다. 네이티브 `title` 속성과 `<span className="sr-only">`를 혼용할 경우 스크린 리더에서 중복으로 읽어주는 문제가 발생할 수 있으며, 키보드 접근성 측면에서도 커스텀 툴팁이 훨씬 우수합니다. 테스트에서는 `delay={0}`을 `Tooltip` 루트 컴포넌트에 주어 타임아웃을 방지합니다.
**Action:** 앞으로 기본 HTML `title` 속성이나 `sr-only` 텍스트 대신 Base UI 구조에 맞는 `render` prop과 `<Tooltip>`, `<TooltipTrigger>`, `<TooltipContent>`를 활용한 커스텀 툴팁으로 마이그레이션하여 통일성 있는 UX와 명확한 접근성을 제공합니다.
