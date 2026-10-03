## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2026-10-03 - 아이콘 버튼의 접근성 툴팁 적용
**Learning:** 아이콘만 있는 버튼에 기본 HTML `title` 속성을 사용하면 키보드나 터치 인터페이스에서 상호작용할 수 없어 접근성이 떨어집니다. 이를 해결하기 위해 `@/components/ui/tooltip`의 커스텀 컴포넌트로 교체할 때, 불필요한 중복 안내를 방지하려면 `aria-label`을 실제 버튼을 렌더링하는 `TooltipTrigger`에 직접 배치해야 합니다. 또한 Base UI의 `TooltipTrigger`는 기본 `Button` 변형(variants)을 전달할 수 없으므로, 레이아웃, 상호작용 및 `aria-disabled` 스타일을 위한 tailwind 유틸리티 클래스를 수동으로 적용해야 합니다.
**Action:** 항상 아이콘만 있는 버튼은 `Tooltip`과 `TooltipTrigger`로 감쌉니다. 트리거가 `button` 역할과 `type="button"`을 유지하는지 역할 기반 테스트로 확인하고, `aria-label`과 `aria-disabled` 상태를 검증하며 기본 `title` 속성은 제거합니다.
