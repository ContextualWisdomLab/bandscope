import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  type TranslationKey,
} from "../../i18n";
import {
  beatDurationMs,
  createIdleTransportState,
  fillRehearsalCopy,
  formatRehearsalClock,
  isPlayableLoopSection,
  nextActionTemplateKey,
  nextActionValues,
  reduceRehearsalTransport,
  resolveLoopWindow,
  type RehearsalTransportState,
} from "./rehearsalTransport";

interface RehearsalPlayerProps {
  song: RehearsalSong;
  hasLocalAudio?: boolean;
  startNonce?: number;
}

const PLAYHEAD_TICK_SECONDS = 0.1;

/** Documented. */
function loopProgressPercent(state: RehearsalTransportState): number {
  if (!state.loop) {
    return 0;
  }
  const duration = state.loop.endSeconds - state.loop.startSeconds;
  if (!(duration > 0)) {
    return 0;
  }
  return Math.min(
    100,
    Math.max(
      0,
      ((state.playheadSeconds - state.loop.startSeconds) / duration) * 100,
    ),
  );
}

/** Render tonight's first section loop with a count-in and a named next action. */
export function RehearsalPlayer({
  song,
  hasLocalAudio = false,
  startNonce = 0,
}: RehearsalPlayerProps): ReactElement {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const playableSections = useMemo(
    () =>
      Array.isArray(song.sections)
        ? song.sections.filter((section) => isPlayableLoopSection(section))
        : [],
    [song],
  );
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    playableSections[0]?.id ?? null,
  );
  const [transport, setTransport] = useState<RehearsalTransportState>(() =>
    reduceRehearsalTransport(createIdleTransportState(), {
      type: "arm",
      loop: resolveLoopWindow(song, playableSections[0]?.id),
    }),
  );
  const lastHandledStartNonce = useRef(0);

  useEffect(() => {
    const nextLoop = resolveLoopWindow(song, selectedSectionId);
    setTransport((current) =>
      reduceRehearsalTransport(current, { type: "arm", loop: nextLoop }),
    );
  }, [song, selectedSectionId]);

  useEffect(() => {
    if (startNonce <= lastHandledStartNonce.current) {
      return;
    }
    lastHandledStartNonce.current = startNonce;
    if (!hasLocalAudio) {
      return;
    }
    setTransport((current) => {
      const armed = current.loop
        ? current
        : reduceRehearsalTransport(current, {
            type: "arm",
            loop: resolveLoopWindow(song, selectedSectionId),
          });
      return reduceRehearsalTransport(armed, { type: "start" });
    });
  }, [startNonce, hasLocalAudio, song, selectedSectionId]);

  useEffect(() => {
    if (transport.phase !== "counting-in" || !transport.loop) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setTransport((current) =>
        reduceRehearsalTransport(current, { type: "beat" }),
      );
    }, beatDurationMs(transport.loop.tempoBpm));
    return () => window.clearInterval(timer);
  }, [transport.phase, transport.loop]);

  useEffect(() => {
    if (transport.phase !== "looping" || !transport.loop) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setTransport((current) =>
        reduceRehearsalTransport(current, {
          type: "tick",
          deltaSeconds: PLAYHEAD_TICK_SECONDS,
        }),
      );
    }, PLAYHEAD_TICK_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [transport.phase, transport.loop]);

  const actionKey = nextActionTemplateKey(transport, hasLocalAudio);
  const nextAction = fillRehearsalCopy(
    t(actionKey as TranslationKey),
    nextActionValues(transport),
  );
  const canStart = transport.loop !== null && hasLocalAudio;
  const canPause =
    transport.phase === "counting-in" || transport.phase === "looping";
  const canStop = transport.phase !== "idle" && transport.loop !== null;
  const startLabel =
    transport.phase === "paused"
      ? t("workspaceLoopResume")
      : t("workspaceLoopStart");

  return (
    <section
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("workspaceLoopRegionLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
        {t("workspaceLoopTitle")}
      </p>
      <p
        className="mt-2 text-sm leading-6 text-slate-200"
        data-testid="rehearsal-loop-next-action"
      >
        {nextAction}
      </p>
      {playableSections.length > 0 ? (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label={t("workspaceLoopSectionPickerLabel")}
        >
          {playableSections.map((section) => {
            const selected =
              section.id === (transport.loop?.sectionId ?? selectedSectionId);
            return (
              <Button
                key={section.id}
                type="button"
                variant={selected ? "default" : "outline"}
                size="sm"
                aria-pressed={selected}
                className={
                  selected
                    ? "min-h-10 border-cyan-300/30 bg-cyan-300 font-semibold text-slate-950"
                    : "min-h-10 border-white/10 bg-white/5 font-semibold text-slate-100"
                }
                onClick={() => setSelectedSectionId(section.id)}
              >
                {section.label} ·{" "}
                {formatRehearsalClock(section.timeRange.start)}–
                {formatRehearsalClock(section.timeRange.end)}
              </Button>
            );
          })}
        </div>
      ) : null}
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"
        aria-hidden="true"
      >
        <div
          data-testid="rehearsal-loop-playhead"
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${loopProgressPercent(transport)}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {formatRehearsalClock(transport.playheadSeconds)} /{" "}
        {formatRehearsalClock(transport.loop?.endSeconds ?? 0)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!canStart}
          aria-disabled={!canStart}
          className="min-h-11 border-cyan-300/30 bg-cyan-300/15 font-semibold text-cyan-50 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() => {
            if (!canStart) {
              return;
            }
            setTransport((current) =>
              reduceRehearsalTransport(current, { type: "start" }),
            );
          }}
        >
          {startLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canPause}
          aria-disabled={!canPause}
          className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() =>
            setTransport((current) =>
              reduceRehearsalTransport(current, { type: "pause" }),
            )
          }
        >
          {t("workspaceLoopPause")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canStop}
          aria-disabled={!canStop}
          className="min-h-11 border-white/10 bg-white/5 font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() =>
            setTransport((current) =>
              reduceRehearsalTransport(current, { type: "stop" }),
            )
          }
        >
          {t("workspaceLoopStop")}
        </Button>
      </div>
    </section>
  );
}