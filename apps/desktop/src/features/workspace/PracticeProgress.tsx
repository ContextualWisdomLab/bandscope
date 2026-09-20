import { memo, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Slider, SliderTrack, SliderIndicator, SliderThumb } from "../../components/ui/slider";

/** Documented. */
interface PracticeProgressProps {
  progress?: number;
  onChange: (newProgress: number) => void;
}

/** Documented. */
function PracticeProgressComponent({ progress = 0, onChange }: PracticeProgressProps) {
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

  const handleSliderChange = useCallback((value: number | readonly number[]) => {
    const numericValue = Array.isArray(value) ? value[0] : (typeof value === "number" ? value : undefined);
    if (numericValue !== undefined) {
      onChange(Math.max(0, Math.min(100, numericValue)));
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
        <button
          type="button"
          onClick={handleDecrease}
          aria-disabled={progress <= 0 ? "true" : undefined}
          className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-label={t("decreasePracticeProgressLabel")}
          title={t("decreasePracticeProgressLabel")}
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>

        <div className="relative flex h-3 flex-1 items-center">
          <Slider
            id="practice-progress-slider"
            min={0}
            max={100}
            step={1}
            value={[progress]}
            onValueChange={handleSliderChange}
          >
            <SliderPrimitive.Control className="w-full">
              <SliderTrack>
                <SliderIndicator />
              </SliderTrack>
              <SliderThumb aria-label={t("practiceProgressLabel")} />
            </SliderPrimitive.Control>
          </Slider>
        </div>

        <button
          type="button"
          onClick={handleIncrease}
          aria-disabled={progress >= 100 ? "true" : undefined}
          className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-label={t("increasePracticeProgressLabel")}
          title={t("increasePracticeProgressLabel")}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const PracticeProgress = memo(PracticeProgressComponent);

export { PracticeProgress };
