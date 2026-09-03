import { memo, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import { createTranslator, detectPreferredLocale } from "../../i18n";

/** Selected-part practice tracker with an optional named next rehearsal step. */
interface PracticeProgressProps {
  progress?: number;
  onChange: (newProgress: number) => void;
  nextActionCopy?: string;
}

/** Documented. */
function PracticeProgressComponent({ progress = 0, onChange, nextActionCopy }: PracticeProgressProps) {
  const t = createTranslator(detectPreferredLocale());

  const handleDecrease = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (progress <= 0) {
      e.preventDefault();
      return;
    }
    onChange(Math.max(0, progress - 10));
  }, [progress, onChange]);

  const handleIncrease = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (progress >= 100) {
      e.preventDefault();
      return;
    }
    onChange(Math.min(100, progress + 10));
  }, [progress, onChange]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!Number.isNaN(value)) {
      onChange(Math.max(0, Math.min(100, value)));
    }
  }, [onChange]);

  return (
    <div
      className="mt-4 rounded-xl border border-indigo-300/20 bg-indigo-300/[0.08] p-4 focus-within:ring-2 focus-within:ring-indigo-300"
      role="region"
      aria-label={t("practiceProgressRegionLabel")}
    >
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="practice-progress-slider" className="text-xs font-black uppercase tracking-[0.24em] text-indigo-200">
          {t("practiceProgressLabel")}
        </label>
        <span className="text-sm font-semibold text-slate-200">{progress}%</span>
      </div>

      {nextActionCopy ? (
        <p className="mb-3 text-sm leading-6 text-slate-100" data-testid="practice-progress-next-action">
          {nextActionCopy}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleDecrease}
          aria-disabled={progress <= 0 ? "true" : undefined}
          className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-label={progress <= 0 ? t("decreasePracticeProgressAtMin") : t("decreasePracticeProgressLabel")}
          title={progress <= 0 ? t("decreasePracticeProgressAtMin") : t("decreasePracticeProgressLabel")}
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>

        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-900/50 shadow-inner">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
          <input
            id="practice-progress-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={progress}
            onChange={handleSliderChange}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        <button
          type="button"
          onClick={handleIncrease}
          aria-disabled={progress >= 100 ? "true" : undefined}
          className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-label={progress >= 100 ? t("increasePracticeProgressAtMax") : t("increasePracticeProgressLabel")}
          title={progress >= 100 ? t("increasePracticeProgressAtMax") : t("increasePracticeProgressLabel")}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const PracticeProgress = memo(PracticeProgressComponent);

export { PracticeProgress };
