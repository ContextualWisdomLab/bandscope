import { memo, useCallback } from "react";
import { createTranslator, detectPreferredLocale } from "../../i18n";

/** Documented. */
interface PracticeProgressProps {
  progress?: number;
  onChange: (newProgress: number) => void;
}

/** Documented. */
function PracticeProgressComponent({ progress = 0, onChange }: PracticeProgressProps) {
  const t = createTranslator(detectPreferredLocale());

  const handleDecrease = useCallback(() => {
    onChange(Math.max(0, progress - 10));
  }, [progress, onChange]);

  const handleIncrease = useCallback(() => {
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
      className="mt-4 rounded-xl border border-indigo-300/20 bg-indigo-300/[0.08] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      role="region"
      tabIndex={0}
      aria-label={t("practiceProgressRegionLabel") || "Practice Progress"}
    >
      <div className="flex items-center justify-between mb-2">
        <label htmlFor="practice-progress-slider" className="text-xs font-black uppercase tracking-[0.24em] text-indigo-200">
          {t("practiceProgressLabel") || "Practice Progress"}
        </label>
        <span className="text-sm font-semibold text-slate-200">{progress}%</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleDecrease}
          disabled={progress <= 0}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition-colors"
          aria-label={t("decreasePracticeProgressLabel") || "Decrease progress"}
        >
          -
        </button>

        <div className="relative flex-1 h-3 rounded-full bg-slate-900/50 shadow-inner overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200 ease-out"
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
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        <button
          type="button"
          onClick={handleIncrease}
          disabled={progress >= 100}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 transition-colors"
          aria-label={t("increasePracticeProgressLabel") || "Increase progress"}
        >
          +
        </button>
      </div>
    </div>
  );
}

const PracticeProgress = memo(PracticeProgressComponent);

export { PracticeProgress };
