1. **아이콘 전용 버튼 툴팁 추가** (`apps/desktop/src/features/score/ScoreViewer.tsx`)
   - 툴팁 컴포넌트들(`Tooltip`, `TooltipContent`, `TooltipTrigger`)을 `import` 합니다.
   - 뷰어 내의 아이콘 버튼(Zoom Out, Zoom In, Fit Width, Prev Page, Next Page)에 대해 `aria-label`이 있지만 마우스를 올렸을 때도 어떤 기능을 하는지 알 수 있도록 툴팁을 추가합니다.

2. **저널 기록 추가** (`.jules/palette.md`)
   - 아이콘 전용 버튼에 툴팁을 추가하는 방식에 대한 발견과 교훈을 기록합니다.

3. **프리커밋 단계 수행**
   - 코드를 포맷팅하고, 린트를 실행하고, 테스트를 수행하여 모든 변경 사항이 유효한지 확인합니다.

4. **제출 (Submit)**
   - 모든 검증이 완료되면 "🎨 Palette: [UX improvement] Add tooltips to icon buttons in score viewer"라는 메시지와 함께 제출합니다.
