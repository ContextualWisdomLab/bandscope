## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.

## 2024-09-28 - Replace native title attributes with accessible Tooltip components on icon-only buttons
**Learning:** 네이티브 HTML `title` 속성은 키보드 및 터치 지원이 부족하여 많은 사용자에게 접근하기 어려우며, 특히 `aria-disabled="true"`가 적용된 아이콘 버튼에서는 더욱 그렇습니다.
**Action:** 인터랙티브 요소의 네이티브 `title` 속성을 커스텀 `@/components/ui/tooltip` 래퍼로 교체합니다. `TooltipTrigger`를 버튼으로 사용할 때 버튼 속성을 직접 전달하여 화면 판독기를 위한 `aria-label`을 유지하고 포커스/호버 시 접근성 있는 커스텀 툴팁이 표시되도록 합니다.
