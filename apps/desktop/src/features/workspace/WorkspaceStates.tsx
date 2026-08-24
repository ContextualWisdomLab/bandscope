import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Music, AlertCircle } from "lucide-react";

interface EmptyStateProps {
  selectedLabel?: string | null;
  selectedKind?: "demo" | "local" | "youtube" | null;
  disabled?: boolean;
  onTryDemo?: () => void;
  onUseOwnSong?: () => void;
}

/** First-run empty workspace: try the licensed demo or use a local song. */
export function EmptyState({
  selectedLabel = null,
  selectedKind = null,
  disabled = false,
  onTryDemo,
  onUseOwnSong
}: EmptyStateProps) {
  const t = createTranslator(detectPreferredLocale());
  const hasSelection = Boolean(selectedLabel);

  return (
    <Card className="border-2 border-dashed border-cyan-300/20 bg-slate-950/50 shadow-[0_18px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <CardContent className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 rounded-full border border-cyan-300/30 bg-cyan-300/10 p-6 text-cyan-200 shadow-[0_0_38px_rgba(34,211,238,0.18)]">
          <Music className="size-10" aria-hidden="true" />
        </div>
        <h3 className="mb-2 text-xl font-black text-white">{t("workspaceReadyToAnalyzeTitle")}</h3>
        <p className="max-w-sm text-slate-400">
          {hasSelection
            ? selectedKind === "local" || selectedKind === "youtube"
              ? t("localSelectedNextAction")
              : t("demoSelectedNextAction")
            : t("workspaceEmptyState")}
        </p>
        {hasSelection ? null : (
          <p className="mt-2 max-w-sm text-xs text-slate-500">{t("demoLimitation")}</p>
        )}
        {onTryDemo || onUseOwnSong ? (
          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            {onTryDemo ? (
              <Button
                type="button"
                onClick={onTryDemo}
                disabled={disabled}
                className="min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950 hover:from-cyan-300 hover:to-violet-400"
                aria-label={t("tryTheDemo")}
              >
                {t("tryTheDemo")}
              </Button>
            ) : null}
            {onUseOwnSong ? (
              <Button
                type="button"
                onClick={onUseOwnSong}
                disabled={disabled}
                variant="outline"
                className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 hover:bg-white/10 hover:text-white"
                aria-label={hasSelection ? t("chooseDifferentSong") : t("useMyOwnSong")}
              >
                {hasSelection ? t("chooseDifferentSong") : t("useMyOwnSong")}
              </Button>
            ) : null}
          </div>
        ) : null}
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
