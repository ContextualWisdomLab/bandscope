import type { KeyboardEvent } from "react";
import { createTranslator, detectPreferredLocale, type TranslationKey } from "../../i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Music, AlertCircle, Play, Upload } from "lucide-react";
import {
  FIRST_RUN_ROLE_OPTIONS,
  displaySelectedAudioName,
  type FirstRunRoleId
} from "./firstRunRoles";

const FIRST_RUN_ROLE_LABELS = {
  "whole-band": "firstRunRoleWholeBand",
  "lead-vocal": "firstRunRoleLeadVocal",
  "bass-guitar": "firstRunRoleBass",
  "keys-right": "firstRunRoleKeys"
} as const satisfies Record<FirstRunRoleId, TranslationKey>;

/** Move a first-run role radio using the ARIA radiogroup keyboard pattern. */
function handleRoleNavigation(
  event: KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  onSelectRole: (roleId: FirstRunRoleId) => void
): void {
  const lastIndex = FIRST_RUN_ROLE_OPTIONS.length - 1;
  let nextIndex: number | null = null;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = lastIndex;
  }

  if (nextIndex === null) {
    return;
  }

  event.preventDefault();
  const nextOption = FIRST_RUN_ROLE_OPTIONS[nextIndex];
  if (!nextOption) {
    return;
  }
  onSelectRole(nextOption.id);
  const group = event.currentTarget.closest('[role="radiogroup"]');
  const radios = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
  radios?.[nextIndex]?.focus();
}

/** Documented. */
export function EmptyState() {
  const t = createTranslator(detectPreferredLocale());
  return (
    <Card className="border-2 border-dashed border-cyan-300/20 bg-slate-950/50 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <CardContent className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 rounded-full border border-cyan-300/30 bg-cyan-300/10 p-6 text-cyan-200 shadow-[0_0_38px_rgba(34,211,238,0.18)]">
          <Music className="size-10" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-xl font-black text-white">{t("workspaceReadyToAnalyzeTitle")}</h3>
        <p className="max-w-sm text-slate-400">{t("workspaceEmptyState")}</p>
      </CardContent>
    </Card>
  );
}

/** Next-action handlers after a local or YouTube source is admitted. */
export interface FirstRunStateProps {
  fileName: string;
  selectedRoleId: FirstRunRoleId;
  onSelectRole: (roleId: FirstRunRoleId) => void;
  onStartAnalysis: () => void;
  onChooseDifferentFile: () => void;
  analysisDisabled?: boolean;
}

/** Render the first-run card that names analyze as the next rehearsal action. */
export function FirstRunState({
  fileName,
  selectedRoleId,
  onSelectRole,
  onStartAnalysis,
  onChooseDifferentFile,
  analysisDisabled = false
}: FirstRunStateProps) {
  const t = createTranslator(detectPreferredLocale());
  const safeFileName = displaySelectedAudioName(fileName);

  return (
    <Card
      className="border-2 border-cyan-300/25 bg-slate-950/55 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl"
      data-selected-audio={safeFileName || undefined}
    >
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-6 rounded-full border border-cyan-300/30 bg-cyan-300/10 p-6 text-cyan-200 shadow-[0_0_38px_rgba(34,211,238,0.18)]">
          <Music className="size-10" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-xl font-black text-white">{t("firstRunTitle")}</h3>
        <p className="max-w-md text-slate-400">{t("firstRunGuidance")}</p>
        <p className="mt-3 max-w-md text-sm text-slate-500">{t("firstRunLocalFirst")}</p>
        {safeFileName && (
          <p className="mt-4 max-w-md text-sm text-slate-300">
            <span className="font-semibold text-slate-400">{t("firstRunFileLabel")}</span>{" "}
            <span className="break-all font-bold text-slate-100">{safeFileName}</span>
          </p>
        )}

        <div
          role="radiogroup"
          aria-label={t("firstRunRoleLabel")}
          className="mt-8 flex w-full max-w-lg flex-wrap items-center justify-center gap-2"
        >
          {FIRST_RUN_ROLE_OPTIONS.map((option, optionIndex) => {
            const checked = selectedRoleId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => onSelectRole(option.id)}
                onKeyDown={(event) => handleRoleNavigation(event, optionIndex, onSelectRole)}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  checked
                    ? "border-cyan-300/40 bg-cyan-300/20 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                {t(FIRST_RUN_ROLE_LABELS[option.id])}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            onClick={onStartAnalysis}
            disabled={analysisDisabled}
            className="min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.28)] hover:from-cyan-300 hover:to-violet-400"
            aria-label={t("firstRunAnalyze")}
          >
            <Play className="mr-2 size-4 fill-current" aria-hidden="true" />
            {t("firstRunAnalyze")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onChooseDifferentFile}
            disabled={analysisDisabled}
            className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
            aria-label={t("firstRunChooseDifferent")}
          >
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {t("firstRunChooseDifferent")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Documented. */
export function LoadingState() {
  const t = createTranslator(detectPreferredLocale());
  return (
    <Card
      className="border-cyan-300/20 bg-slate-950/75 shadow-[0_18px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
    >
      <CardContent className="flex flex-col items-center justify-center py-24 text-center">
        <Loader2 className="mb-6 size-12 animate-spin text-cyan-300" aria-hidden="true" />
        <h3 className="mb-2 text-xl font-black text-white">{t("workspaceAnalyzingAudioTitle")}</h3>
        <p className="max-w-sm animate-pulse text-slate-400">{t("workspaceLoadingState")}</p>
      </CardContent>
    </Card>
  );
}

/** Documented. */
export function ErrorState({ error }: { error?: string }) {
  const t = createTranslator(detectPreferredLocale());
  return (
    <Card className="border-rose-300/30 bg-rose-950/40 shadow-[0_18px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl" role="alert" aria-live="assertive" aria-atomic="true">
      <CardContent className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 rounded-full border border-rose-300/30 bg-rose-300/10 p-4 text-rose-200 shadow-sm">
          <AlertCircle className="size-8" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-lg font-black text-rose-100">{t("workspaceErrorState")}</h3>
        {error && <p className="mt-2 rounded-md bg-rose-300/10 px-4 py-2 text-sm font-medium text-rose-100">{error}</p>}
      </CardContent>
    </Card>
  );
}
