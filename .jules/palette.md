## 2024-05-19 - Replace HTML disabled with aria-disabled="true" for Accessible Tooltips
**Learning:** Native HTML `disabled` attributes completely hide elements from screen readers and block all pointer/hover events, preventing tooltips from functioning for disabled elements.
**Action:** Replace `disabled` with `aria-disabled="true"`, enforce block click handlers via `e.preventDefault()`, and add a title tooltip directly to the element to maintain full tooltip accessibility and keyboard focus support for visually impaired and mouse users.
## 2023-10-11 - Dialog 컴포넌트 툴팁 접근성 개선
**Learning:** `DialogPrimitive.Close`의 네이티브 `title` 속성은 키보드 사용자에게 접근성 없는 툴팁을 생성하며 디자인 시스템과 일치하지 않음.
**Action:** 네이티브 `title` 속성을 커스텀 `Tooltip` 래퍼로 교체하고, `DialogPrimitive.Close`에 `render` prop과 `delay={0}`을 사용하여 수화 오류 없이 일관된 접근성을 보장함.
