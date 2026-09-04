import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Music, AlertCircle, Upload, Link2 } from "lucide-react";

/** Next-action handlers for the empty rehearsal workspace. */
export interface EmptyStateProps {
  onChooseLocalAudio?: () => void;
  onFocusYoutube?: () => void;
}

/** Documented. */
export function EmptyState({ onChooseLocalAudio, onFocusYoutube }: EmptyStateProps = {}) {
  const t = createTranslator(detectPreferredLocale());
  return (
    <Card className="border-2 border-dashed border-cyan-300/20 bg-slate-950/50 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <CardContent className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 rounded-full border border-cyan-300/30 bg-cyan-300/10 p-6 text-cyan-200 shadow-[0_0_38px_rgba(34,211,238,0.18)]">
          <Music className="size-10" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-xl font-black text-white">{t("workspaceReadyToAnalyzeTitle")}</h3>
        <p className="max-w-sm text-slate-400">{t("workspaceEmptyState")}</p>
        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            onClick={() => onChooseLocalAudio?.()}
            className="min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.28)] hover:from-cyan-300 hover:to-violet-400"
            aria-label={t("workspaceEmptyChooseAudio")}
          >
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {t("workspaceEmptyChooseAudio")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onFocusYoutube?.()}
            className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
            aria-label={t("workspaceEmptyPasteYoutube")}
          >
            <Link2 className="mr-2 size-4" aria-hidden="true" />
            {t("workspaceEmptyPasteYoutube")}
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

/** Stable presentation categories derived only from validated analysis status. */
export type WorkspaceFailureKind = "generic" | "engine" | "decode" | "separate";

/** Next-action handlers after a failed analysis. */
export interface ErrorStateProps {
  error?: string;
  kind?: WorkspaceFailureKind;
  onChooseLocalAudio?: () => void;
  onStartOver?: () => void;
}

/** Resolve safe failure copy without interpreting provider or filesystem error text. */
function failureCopy(
  kind: WorkspaceFailureKind,
  t: ReturnType<typeof createTranslator>
): { title: string; guidance?: string } {
  switch (kind) {
    case "engine":
      return {
        title: t("workspaceErrorEngineTitle"),
        guidance: t("workspaceErrorEngineGuidance")
      };
    case "decode":
      return {
        title: t("workspaceErrorDecodeTitle"),
        guidance: t("workspaceErrorDecodeGuidance")
      };
    case "separate":
      return {
        title: t("workspaceErrorSeparateTitle"),
        guidance: t("workspaceErrorSeparateGuidance")
      };
    case "generic":
      return { title: t("workspaceErrorState") };
  }
}

/** Render a recoverable, local-first analysis failure state. */
export function ErrorState({
  error,
  kind = "generic",
  onChooseLocalAudio,
  onStartOver
}: ErrorStateProps) {
  const t = createTranslator(detectPreferredLocale());
  const copy = failureCopy(kind, t);
  return (
    <Card className="border-rose-300/30 bg-rose-950/40 shadow-[0_18px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl" role="alert" aria-live="assertive" aria-atomic="true">
      <CardContent className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 rounded-full border border-rose-300/30 bg-rose-300/10 p-4 text-rose-200 shadow-sm">
          <AlertCircle className="size-8" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-lg font-black text-rose-100">{copy.title}</h3>
        {copy.guidance && <p className="max-w-md text-sm leading-6 text-rose-100/80">{copy.guidance}</p>}
        {error && <p className="mt-2 rounded-md bg-rose-300/10 px-4 py-2 text-sm font-medium text-rose-100">{error}</p>}
        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            onClick={() => {
              onStartOver?.();
              onChooseLocalAudio?.();
            }}
            className="min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.28)] hover:from-cyan-300 hover:to-violet-400"
            aria-label={t("workspaceErrorChooseAnother")}
          >
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {t("workspaceErrorChooseAnother")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onStartOver?.()}
            className="min-h-11 border-rose-300/30 bg-rose-300/10 font-semibold text-rose-50 hover:bg-rose-300/20"
            aria-label={t("workspaceErrorStartOver")}
          >
            {t("workspaceErrorStartOver")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
