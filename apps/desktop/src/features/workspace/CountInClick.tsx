import { useEffect, useMemo, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWebAudioCountInEngine, type CountInClickEngine } from "./countInClickEngine";
import { fillCountInCopy, type FirstCountInPlan } from "./firstCountIn";
import { createTranslator } from "../../i18n";

type Translator = ReturnType<typeof createTranslator>;

interface CountInClickProps {
  plan: FirstCountInPlan | null;
  t: Translator;
  engine?: CountInClickEngine;
}

/**
 * Play tonight's local count-in click, then send the player to the range check.
 *
 * This is a metronome click, not song playback and not stem isolation. A
 * missing audio context fails closed with an ear-count next action.
 */
export function CountInClick({ plan, t, engine }: CountInClickProps) {
  const defaultEngine = useMemo(() => engine ?? createWebAudioCountInEngine(), [engine]);
  const engineRef = useRef(defaultEngine);
  engineRef.current = defaultEngine;
  const [status, setStatus] = useState<"idle" | "playing" | "done" | "blocked">("idle");
  const playGeneration = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    playGeneration.current += 1;
    inFlight.current = false;
    setStatus("idle");

    return () => {
      playGeneration.current += 1;
      inFlight.current = false;
      defaultEngine.stop();
    };
  }, [defaultEngine, plan?.beats, plan?.intervalMs, plan?.sectionLabel, plan?.tempoBpm]);

  const guidance = useMemo(() => {
    if (!plan) {
      return t("workspaceFirstCountInMissing");
    }
    const values = {
      beats: String(plan.beats),
      tempo: String(plan.tempoBpm),
      sectionLabel: plan.sectionLabel ?? ""
    };
    if (plan.sectionLabel) {
      return fillCountInCopy(t("workspaceFirstCountInReady"), values);
    }
    return fillCountInCopy(t("workspaceFirstCountInReadyNoSection"), values);
  }, [plan, t]);

  const unavailableCopy = fillCountInCopy(t("workspaceFirstCountInUnavailable"), {
    beats: String(plan?.beats ?? 4)
  });

  /** Start the active count-in unless playback is unavailable or already in flight. */
  const handleCountIn = async (): Promise<void> => {
    if (!plan || !engineRef.current.available || inFlight.current) {
      return;
    }

    const generation = playGeneration.current + 1;
    playGeneration.current = generation;
    inFlight.current = true;
    setStatus("playing");
    try {
      await engineRef.current.play(plan);
      if (playGeneration.current === generation) {
        setStatus("done");
      }
    } catch {
      if (playGeneration.current === generation) {
        setStatus("blocked");
      }
    } finally {
      if (playGeneration.current === generation) {
        inFlight.current = false;
      }
    }
  };

  /** Stop the active count-in and invalidate any completion still in flight. */
  const handleStop = (): void => {
    playGeneration.current += 1;
    inFlight.current = false;
    engineRef.current.stop();
    setStatus("idle");
  };

  const canPlay = Boolean(plan) && defaultEngine.available && status !== "playing";
  const actionLabel = status === "playing" ? t("workspaceFirstCountInPlaying") : t("workspaceFirstCountInAction");
  const doneCopy = status === "done" ? t("workspaceFirstCountInDone") : null;
  const blockedCopy =
    Boolean(plan) && (!defaultEngine.available || status === "blocked") ? unavailableCopy : null;

  return (
    <section
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4"
      data-testid="first-count-in"
      aria-label={t("workspaceFirstCountInTitle")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("workspaceFirstCountInTitle")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-100">{guidance}</p>
      {doneCopy ? <p className="mt-2 text-sm font-semibold text-emerald-100">{doneCopy}</p> : null}
      {blockedCopy ? <p className="mt-2 text-sm font-semibold text-amber-100">{blockedCopy}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            void handleCountIn();
          }}
          disabled={!canPlay}
          aria-label={
            plan
              ? fillCountInCopy(t("workspaceFirstCountInActionLabel"), {
                  beats: String(plan.beats),
                  tempo: String(plan.tempoBpm)
                })
              : t("workspaceFirstCountInAction")
          }
          className="min-h-11 border-amber-300/30 bg-amber-300/15 font-semibold text-amber-50 hover:bg-amber-300/25 hover:text-white"
        >
          <Timer className="mr-2 size-4 text-amber-200" aria-hidden="true" />
          {actionLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleStop}
          disabled={status !== "playing"}
          aria-label={t("workspaceFirstCountInStop")}
          className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100"
        >
          {t("workspaceFirstCountInStop")}
        </Button>
      </div>
    </section>
  );
}
