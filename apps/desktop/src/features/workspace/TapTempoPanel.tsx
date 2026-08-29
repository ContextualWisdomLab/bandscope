import { useMemo, useState } from "react";
import { CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTranslator } from "../../i18n";
import {
  emptyTapTempo,
  fillTapCopy,
  MIN_TAP_COUNT,
  recordTap,
  tapTempoReading,
  type TapTempoState
} from "./tapTempo";

type Translator = ReturnType<typeof createTranslator>;

interface TapTempoProps {
  t: Translator;
  nowMs?: () => number;
}

/**
 * Measure tonight's count-in tempo from the player's taps when the song
 * has no trusted BPM. Session-only; this does not write `song.tempo`.
 */
export function TapTempo({ t, nowMs }: TapTempoProps) {
  const [state, setState] = useState<TapTempoState>(emptyTapTempo);
  const reading = useMemo(() => tapTempoReading(state), [state]);
  const clock = nowMs ?? Date.now;

  const guidance = reading
    ? fillTapCopy(t("workspaceTapTempoReady"), {
        tempo: String(reading.tempoBpm),
        taps: String(reading.tapCount)
      })
    : state.tapsMs.length > 0
      ? t("workspaceTapTempoKeep")
      : t("workspaceTapTempoNeed");

  const filledLamps = Math.min(state.tapsMs.length, MIN_TAP_COUNT);

  return (
    <section
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4"
      data-testid="tap-tempo"
      aria-label={t("workspaceTapTempoTitle")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("workspaceTapTempoTitle")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-100">{guidance}</p>
      <div className="mt-3 flex gap-2" aria-hidden="true">
        {Array.from({ length: MIN_TAP_COUNT }, (_, index) => (
          <span
            key={index}
            data-testid={`tap-lamp-${index}`}
            className={
              "size-3 rounded-full " +
              (index < filledLamps ? "bg-amber-300" : "bg-white/15")
            }
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            setState((current) => recordTap(current, clock()));
          }}
          aria-label={t("workspaceTapTempoActionLabel")}
          className="min-h-11 border-amber-300/30 bg-amber-300/15 font-semibold text-amber-50 hover:bg-amber-300/25 hover:text-white"
        >
          <CircleDot className="mr-2 size-4 text-amber-200" aria-hidden="true" />
          {t("workspaceTapTempoAction")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setState(emptyTapTempo());
          }}
          disabled={state.tapsMs.length === 0}
          aria-label={t("workspaceTapTempoResetLabel")}
          className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100"
        >
          {t("workspaceTapTempoReset")}
        </Button>
      </div>
    </section>
  );
}
