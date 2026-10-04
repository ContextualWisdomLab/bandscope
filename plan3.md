1. **아이콘 전용 버튼 툴팁 추가** (`apps/desktop/src/features/score/ScoreViewer.tsx`)
   - `replace_with_git_merge_diff` 도구를 사용하여 `apps/desktop/src/features/score/ScoreViewer.tsx` 파일에 `Tooltip`, `TooltipContent`, `TooltipTrigger`를 import 하고, 아이콘 전용 `Button`들(Zoom Out, Zoom In, Prev Page, Next Page)을 툴팁으로 감싸는 작업을 수행합니다.
     ```
<<<<<<< SEARCH
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
=======
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
>>>>>>> REPLACE
<<<<<<< SEARCH
            <Button
              variant="outline"
              size="icon-lg"
              className="size-12"
              aria-label={t("scoreViewerZoomOut")}
              onClick={zoomOut}
            >
              <ZoomOut aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-lg"
              className="size-12"
              aria-label={t("scoreViewerZoomIn")}
              onClick={zoomIn}
            >
              <ZoomIn aria-hidden="true" />
            </Button>
=======
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="size-12"
                    aria-label={t("scoreViewerZoomOut")}
                    onClick={zoomOut}
                  />
                }
              >
                <ZoomOut aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{t("scoreViewerZoomOut")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="size-12"
                    aria-label={t("scoreViewerZoomIn")}
                    onClick={zoomIn}
                  />
                }
              >
                <ZoomIn aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{t("scoreViewerZoomIn")}</TooltipContent>
            </Tooltip>
>>>>>>> REPLACE
<<<<<<< SEARCH
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon-lg"
            className="size-14"
            aria-label={t("scoreViewerPrevPage")}
            disabled={pageNumber <= 1}
            onClick={goToPreviousPage}
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold text-slate-200">
            {pageIndicator}
          </span>
          <Button
            variant="outline"
            size="icon-lg"
            className="size-14"
            aria-label={t("scoreViewerNextPage")}
            disabled={pageNumber >= pageCount}
            onClick={goToNextPage}
          >
            <ChevronRight className="size-6" aria-hidden="true" />
          </Button>
        </div>
=======
        <div className="flex items-center justify-center gap-4">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-lg"
                  className="size-14"
                  aria-label={t("scoreViewerPrevPage")}
                  disabled={pageNumber <= 1}
                  onClick={goToPreviousPage}
                />
              }
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{t("scoreViewerPrevPage")}</TooltipContent>
          </Tooltip>
          <span className="min-w-28 text-center text-sm font-semibold text-slate-200">
            {pageIndicator}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-lg"
                  className="size-14"
                  aria-label={t("scoreViewerNextPage")}
                  disabled={pageNumber >= pageCount}
                  onClick={goToNextPage}
                />
              }
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{t("scoreViewerNextPage")}</TooltipContent>
          </Tooltip>
        </div>
>>>>>>> REPLACE
     ```

2. **아이콘 전용 버튼 툴팁 추가** (`apps/desktop/src/features/score/ScoreView.tsx`)
   - `replace_with_git_merge_diff` 도구를 사용하여 `apps/desktop/src/features/score/ScoreView.tsx` 파일에 `Tooltip`, `TooltipContent`, `TooltipTrigger`를 import 하고, 휴지통 버튼을 툴팁으로 감싸는 작업을 수행합니다.
     ```
<<<<<<< SEARCH
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
=======
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
>>>>>>> REPLACE
<<<<<<< SEARCH
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={projectId ? () => void handleRemove(projectId, attachment) : undefined}
                      disabled={!projectId}
                      aria-label={`${t("scoreRemove")}: ${attachment.fileName}`}
                      className="size-10 border-rose-300/25 text-rose-200 hover:bg-rose-400/10"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
=======
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={projectId ? () => void handleRemove(projectId, attachment) : undefined}
                            disabled={!projectId}
                            aria-label={`${t("scoreRemove")}: ${attachment.fileName}`}
                            className="size-10 border-rose-300/25 text-rose-200 hover:bg-rose-400/10"
                          />
                        }
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipContent>{t("scoreRemove")}</TooltipContent>
                    </Tooltip>
>>>>>>> REPLACE
     ```

3. **코드 변경 검증**
   - `run_in_bash_session` 도구를 사용하여 `git diff apps/desktop/src/features/score/ScoreViewer.tsx apps/desktop/src/features/score/ScoreView.tsx`를 실행해 툴팁이 제대로 추가되었는지 확인합니다.

4. **프론트엔드 테스트 및 검사 실행**
   - `run_in_bash_session` 도구를 사용하여 `npm install` 및 `npm run test --workspaces`를 실행하여 프론트엔드 코드가 정상적으로 작동하고 오류가 없는지 확인합니다.

5. **백엔드 테스트 실행**
   - `run_in_bash_session` 도구를 사용하여 `cd services/analysis-engine && uv run pytest`를 실행하여 백엔드 코드가 정상적으로 작동하고 오류가 없는지 확인합니다.

6. **린트 검사 실행**
   - `run_in_bash_session` 도구를 사용하여 `npm run lint` 를 실행하여 포맷팅 및 정적 분석 상 오류가 없는지 확인합니다.

7. **저널 기록 추가** (`.jules/palette.md`)
   - `run_in_bash_session` 도구의 `echo "..." >> .jules/palette.md` 명령어를 사용하여 다음 내용을 정확하게 덧붙입니다.
     ```
     ## 2026-10-04 - Add Tooltips to Icon-Only Buttons
     **Learning:** aria-label alone is sufficient for screen readers, but sighted mouse/keyboard users miss out on the meaning of icon-only buttons. Tooltips bridge this accessibility gap for non-screen-reader users.
     **Action:** Always wrap icon-only buttons with Tooltip components to ensure both screen reader support (via aria-label) and visual support (via TooltipContent).
     ```

8. **저널 기록 검증**
   - `run_in_bash_session` 도구를 사용하여 `cat .jules/palette.md` 를 실행하여 저널 기록이 잘 추가되었는지 확인합니다.

9. **사전 커밋(Pre-commit) 단계 완료**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

10. **제출 (Submit)**
   - `submit` 도구를 사용하여 "🎨 Palette: [UX improvement] Add tooltips to icon-only buttons" 메시지와 함께 제출합니다.
