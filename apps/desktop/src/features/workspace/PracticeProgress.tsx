import { memo, useCallback, useId } from "react";
import { Minus, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createTranslator, detectPreferredLocale } from "../../i18n";

/** Documented. */
interface PracticeProgressProps {
  progress?: number;
  onChange: (newProgress: number) => void;
}

/** Documented. */
function PracticeProgressComponent({ progress = 0, onChange }: PracticeProgressProps) {
  const t = createTranslator(detectPreferredLocale());
  const decreaseLimitDescriptionId = useId();
  const increaseLimitDescriptionId = useId();
  const atMinimum = progress <= 0;
  const atMaximum = progress >= 100;

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

      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={handleDecrease}
            aria-disabled={atMinimum ? "true" : undefined}
            aria-describedby={atMinimum ? decreaseLimitDescriptionId : undefined}
            className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            aria-label={t("decreasePracticeProgressLabel")}
          >
            <Minus className="size-4" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>
            {t(atMinimum ? "practiceProgressAtMin" : "decreasePracticeProgressLabel")}
          </TooltipContent>
        </Tooltip>
        {atMinimum ? (
          <span id={decreaseLimitDescriptionId} className="sr-only">
            {t("practiceProgressAtMin")}
          </span>
        ) : null}

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

        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={handleIncrease}
            aria-disabled={atMaximum ? "true" : undefined}
            aria-describedby={atMaximum ? increaseLimitDescriptionId : undefined}
            className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            aria-label={t("increasePracticeProgressLabel")}
          >
            <Plus className="size-4" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>
            {t(atMaximum ? "practiceProgressAtMax" : "increasePracticeProgressLabel")}
          </TooltipContent>
        </Tooltip>
        {atMaximum ? (
          <span id={increaseLimitDescriptionId} className="sr-only">
            {t("practiceProgressAtMax")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const PracticeProgress = memo(PracticeProgressComponent);

export { PracticeProgress };