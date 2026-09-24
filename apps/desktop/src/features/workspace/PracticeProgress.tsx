import { memo, useCallback, useId } from "react";
import { Minus, Plus } from "lucide-react";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderLabel,
  SliderThumb,
  SliderTrack,
} from "../../components/ui/slider";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Properties for the rehearsal practice-progress control. */
interface PracticeProgressProps {
  progress?: number;
  onChange: (newProgress: number) => void;
}

/** Render the rehearsal practice-progress controls and accessible boundary cues. */
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

  const handleSliderChange = useCallback((value: number | readonly number[]) => {
    const numericValue = Array.isArray(value) ? value[0] : value;
    if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
      return;
    }
    onChange(Math.max(0, Math.min(100, numericValue)));
  }, [onChange]);

  const decreaseActionLabel = t("decreasePracticeProgressLabel");
  const increaseActionLabel = t("increasePracticeProgressLabel");
  const minimumReason = t("practiceProgressAtMin");
  const maximumReason = t("practiceProgressAtMax");

  return (
    <div
      className="mt-4 rounded-xl border border-indigo-300/20 bg-indigo-300/[0.08] p-4 focus-within:ring-2 focus-within:ring-indigo-300"
      role="region"
      aria-label={t("practiceProgressRegionLabel")}
    >
      <Slider
        min={0}
        max={100}
        step={1}
        value={progress}
        onValueChange={handleSliderChange}
        className="block w-full"
      >
        <div className="mb-2 flex items-center justify-between">
          <SliderLabel className="text-xs font-black uppercase tracking-[0.24em] text-indigo-200">
            {t("practiceProgressLabel")}
          </SliderLabel>
          <span className="text-sm font-semibold text-slate-200">{progress}%</span>
        </div>

        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={handleDecrease}
              aria-disabled={atMinimum ? "true" : undefined}
              aria-describedby={atMinimum ? decreaseLimitDescriptionId : undefined}
              className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-label={decreaseActionLabel}
            >
              <Minus className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              {atMinimum ? `${decreaseActionLabel}: ${minimumReason}` : decreaseActionLabel}
            </TooltipContent>
          </Tooltip>
          {atMinimum ? (
            <span id={decreaseLimitDescriptionId} className="sr-only">
              {minimumReason}
            </span>
          ) : null}

          <SliderControl className="h-11 min-h-11 flex-1">
            <SliderTrack className="h-3 bg-slate-900/50 shadow-inner">
              <SliderIndicator className="bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200 ease-out" />
              <SliderThumb />
            </SliderTrack>
          </SliderControl>

          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={handleIncrease}
              aria-disabled={atMaximum ? "true" : undefined}
              aria-describedby={atMaximum ? increaseLimitDescriptionId : undefined}
              className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              aria-label={increaseActionLabel}
            >
              <Plus className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              {atMaximum ? `${increaseActionLabel}: ${maximumReason}` : increaseActionLabel}
            </TooltipContent>
          </Tooltip>
          {atMaximum ? (
            <span id={increaseLimitDescriptionId} className="sr-only">
              {maximumReason}
            </span>
          ) : null}
        </div>
      </Slider>
    </div>
  );
}

const PracticeProgress = memo(PracticeProgressComponent);

export { PracticeProgress };
