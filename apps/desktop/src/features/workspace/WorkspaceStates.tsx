import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Music, AlertCircle } from "lucide-react";

/** Documented. */
export function EmptyState() {
  const t = createTranslator(detectPreferredLocale());
  return (
    <Card className="border-dashed border-2 bg-transparent shadow-none">
      <CardContent className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-full bg-zinc-100 p-6 mb-6 text-zinc-400 border border-zinc-200 shadow-sm">
          <Music className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-semibold text-zinc-900 mb-2">Ready to Analyze</h3>
        <p className="text-zinc-500 max-w-sm">{t("workspaceEmptyState")}</p>
      </CardContent>
    </Card>
  );
}

/** Documented. */
export function LoadingState() {
  const t = createTranslator(detectPreferredLocale());
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="flex flex-col items-center justify-center py-24 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-zinc-400 mb-6" />
        <h3 className="text-xl font-semibold text-zinc-900 mb-2">Analyzing Audio</h3>
        <p className="text-zinc-500 max-w-sm animate-pulse">{t("workspaceLoadingState")}</p>
      </CardContent>
    </Card>
  );
}

/** Documented. */
export function ErrorState({ error }: { error?: string }) {
  const t = createTranslator(detectPreferredLocale());
  return (
    <Card className="border-rose-200 bg-rose-50 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-rose-100 p-4 mb-4 text-rose-600 shadow-sm border border-rose-200">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-rose-900 mb-2">{t("workspaceErrorState")}</h3>
        {error && <p className="text-rose-700 bg-rose-100/50 px-4 py-2 rounded-md font-medium text-sm mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
}
