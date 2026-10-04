1. **아이콘 전용 버튼 툴팁 추가** (`apps/desktop/src/features/score/ScoreViewer.tsx`)
   - `run_in_bash_session` 도구를 사용하여 `sed` 명령어나 파이썬 스크립트로 `apps/desktop/src/features/score/ScoreViewer.tsx` 파일에 `Tooltip`, `TooltipContent`, `TooltipTrigger`를 import 하고, `Button`들을 툴팁으로 감싸는 작업을 수행합니다.
     - `import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";` 를 상단에 추가.
     - Zoom Out, Zoom In, Fit Width, Prev Page, Next Page 아이콘 버튼들을 `<Tooltip><TooltipTrigger render={<Button ... />}>{children}</TooltipTrigger><TooltipContent>툴팁 내용</TooltipContent></Tooltip>` 형태로 변경합니다.

2. **코드 변경 검증**
   - `run_in_bash_session` 도구를 사용하여 `cat apps/desktop/src/features/score/ScoreViewer.tsx` 또는 `git diff`를 실행해 툴팁이 제대로 추가되었는지 확인합니다.

3. **테스트 및 검사 실행**
   - `run_in_bash_session` 도구를 사용하여 `npm install` 및 `npm run lint`와 `npm run test`를 실행하여 코드가 정상적으로 작동하고 오류가 없는지 확인합니다.

4. **저널 기록 추가** (`.jules/palette.md`)
   - `run_in_bash_session` 도구의 `echo "..." >> .jules/palette.md` 명령어를 사용하여 다음 내용을 정확하게 덧붙입니다.
     ```
     ## 2026-10-04 - Add Tooltips to Icon-Only Buttons
     **Learning:** aria-label alone is sufficient for screen readers, but sighted mouse/keyboard users miss out on the meaning of icon-only buttons. Tooltips bridge this accessibility gap for non-screen-reader users.
     **Action:** Always wrap icon-only buttons with Tooltip components to ensure both screen reader support (via aria-label) and visual support (via TooltipContent).
     ```

5. **저널 기록 검증**
   - `run_in_bash_session` 도구를 사용하여 `cat .jules/palette.md` 를 실행하여 저널 기록이 잘 추가되었는지 확인합니다.

6. **사전 커밋(Pre-commit) 단계 완료**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

7. **제출 (Submit)**
   - `submit` 도구를 사용하여 "🎨 Palette: [UX improvement] Add tooltips to icon-only buttons" 메시지와 함께 제출합니다.
