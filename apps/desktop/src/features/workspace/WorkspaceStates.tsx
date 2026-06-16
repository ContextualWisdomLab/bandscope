import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Music, AlertCircle } from "lucide-react";

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

/** Documented. */
export function LoadingState({
  progressLabel,
  progressPercent
}: {
  progressLabel?: string;
  progressPercent?: number;
}) {
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
        {progressLabel ? (
          <div className="mt-2 w-full max-w-xs space-y-2">
            <p className="text-sm font-medium text-cyan-200">{progressLabel}</p>
            {progressPercent !== undefined && (
              <Progress
                aria-label="Workspace analysis progress"
                value={progressPercent}
              />
            )}
          </div>
        ) : (
          <p className="max-w-sm animate-pulse text-slate-400">{t("workspaceLoadingState")}</p>
        )}
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
