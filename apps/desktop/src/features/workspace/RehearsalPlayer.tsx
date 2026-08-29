import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { convertFileSrc } from "@tauri-apps/api/core";
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
  nextActionTemplateKey,
  nextActionValues,
  isRehearsalPlaybackRate,
  rehearsalPlaybackRates,
  reduceRehearsalTransport,
  resolveLoopWindows,
  type RehearsalLoopWindow,
  type RehearsalTransportState,
} from "./rehearsalTransport";

interface RehearsalPlayerProps {
  song: RehearsalSong;
  hasLocalAudio?: boolean;
  audioSourcePath?: string | null;
  activeRole?: string | null;
  activeRoleName?: string | null;
  startNonce?: number;
}

/** Convert a validated native source path into a scoped Tauri asset URL. */
function resolveAudioSourceUrl(
  sourcePath: string | null | undefined,
): string | null {
  if (!sourcePath || sourcePath.startsWith("browser://")) {
    return null;
  }
  try {
    return convertFileSrc(sourcePath);
  } catch {
    return null;
  }
}

/** Return whether a source path can be converted into a playable native asset URL. */
export function isPlayableAudioSource(
  sourcePath: string | null | undefined,
): boolean {
  return resolveAudioSourceUrl(sourcePath) !== null;
}

/** Return the displayed map-clock progress for the current loop. */
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

/** Return whether two loop windows describe the same transport timing authority. */
function hasSameLoopTiming(
  current: RehearsalLoopWindow,
  next: RehearsalLoopWindow,
): boolean {
  return (
    current.sectionId === next.sectionId &&
    current.startSeconds === next.startSeconds &&
    current.endSeconds === next.endSeconds &&
    current.tempoBpm === next.tempoBpm &&
    current.countInBeats === next.countInBeats
  );
}

/** Render tonight's first section loop with a count-in and a named next action. */
export function RehearsalPlayer({
  song,
  hasLocalAudio = false,
  audioSourcePath = null,
  activeRole = null,
  activeRoleName = null,
  startNonce = 0,
}: RehearsalPlayerProps): ReactElement {
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const playableLoops = useMemo(
    () => resolveLoopWindows(song, activeRole),
    [activeRole, song],
  );
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0);
  const selectedRendererIndex = playableLoops[selectedSectionIndex]
    ? selectedSectionIndex
    : 0;
  const [transport, setTransport] = useState<RehearsalTransportState>(() =>
    reduceRehearsalTransport(createIdleTransportState(), {
      type: "arm",
      loop: playableLoops[0] ?? null,
    }),
  );
  const lastHandledStartNonce = useRef(0);
  const restartAudioOnLoopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioSourceUrl = useMemo(
    () => resolveAudioSourceUrl(audioSourcePath),
    [audioSourcePath],
  );
  const hasPlayableAudio = hasLocalAudio && audioSourceUrl !== null;
  const hasNativeAudioConversionError = Boolean(
    hasLocalAudio &&
      audioSourcePath &&
      !audioSourcePath.startsWith("browser://") &&
      audioSourceUrl === null,
  );
  const [playbackError, setPlaybackError] = useState(false);

  const handlePlaybackError = useCallback(() => {
    setPlaybackError(true);
    setTransport((current) => {
      if (current.phase === "idle" || current.phase === "armed") {
        return current;
      }
      return reduceRehearsalTransport(current, { type: "stop" });
    });
  }, []);

  const startAudio = useCallback(
    (loop: RehearsalLoopWindow, resume: boolean) => {
      const audio = audioRef.current;
      if (!audio || !audioSourceUrl) {
        handlePlaybackError();
        return;
      }
      try {
        restartAudioOnLoopRef.current = !resume;
        if (!resume) {
          audio.currentTime = loop.startSeconds;
          audio.volume = 0;
        } else {
          audio.volume = 1;
        }
        const playPromise = audio.play();
        if (playPromise) {
          void playPromise.catch(handlePlaybackError);
        }
      } catch {
        handlePlaybackError();
      }
    },
    [audioSourceUrl, handlePlaybackError],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }
    if (!audio.paused) {
      audio.pause();
    }
    audio.volume = 1;
    if (audioSourceUrl) {
      audio.src = audioSourceUrl;
      audio.load();
    } else {
      audio.removeAttribute("src");
    }
    setPlaybackError(hasNativeAudioConversionError);
    return () => {
      if (!audio.paused) {
        audio.pause();
      }
    };
  }, [audioSourceUrl, hasNativeAudioConversionError]);

  useEffect(() => {
    const nextLoop = playableLoops[selectedRendererIndex] ?? null;
    setTransport((current) => {
      if (
        current.loop &&
        nextLoop &&
        hasSameLoopTiming(current.loop, nextLoop)
      ) {
        if (
          current.loop.sectionLabel === nextLoop.sectionLabel &&
          current.loop.tempoAssumed === nextLoop.tempoAssumed
        ) {
          return current;
        }
        return { ...current, loop: nextLoop };
      }
      return reduceRehearsalTransport(current, { type: "arm", loop: nextLoop });
    });
  }, [playableLoops, selectedRendererIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    try {
      audio.playbackRate = transport.playbackRate;
      if ("preservesPitch" in audio) {
        audio.preservesPitch = true;
      }
    } catch {
      handlePlaybackError();
    }
  }, [audioSourceUrl, handlePlaybackError, transport.playbackRate]);

  useEffect(() => {
    if (startNonce <= lastHandledStartNonce.current) {
      return;
    }
    lastHandledStartNonce.current = startNonce;
    if (!hasPlayableAudio) {
      return;
    }
    const selectedLoop = playableLoops[selectedRendererIndex] ?? null;
    if (selectedLoop) {
      setPlaybackError(false);
      startAudio(selectedLoop, false);
    }
    setTransport((current) => {
      const armed = reduceRehearsalTransport(current, {
        type: "arm",
        loop: selectedLoop,
      });
      return reduceRehearsalTransport(armed, { type: "start" });
    });
  }, [
    startAudio,
    startNonce,
    hasPlayableAudio,
    playableLoops,
    selectedRendererIndex,
  ]);

  useEffect(() => {
    if (hasPlayableAudio) {
      return;
    }
    setTransport((current) => {
      if (current.phase === "idle" || current.phase === "armed") {
        return current;
      }
      return reduceRehearsalTransport(current, { type: "stop" });
    });
  }, [hasPlayableAudio]);

  useEffect(() => {
    if (transport.phase !== "counting-in" || !transport.loop) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setTransport((current) =>
        reduceRehearsalTransport(current, { type: "beat" }),
      );
    }, beatDurationMs(transport.loop.tempoBpm) / transport.playbackRate);
    return () => window.clearInterval(timer);
  }, [transport.phase, transport.loop, transport.playbackRate]);

  useEffect(() => {
    if (!audioSourceUrl || !transport.loop) {
      return undefined;
    }
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }
    if (transport.phase === "looping") {
      try {
        if (restartAudioOnLoopRef.current) {
          audio.currentTime = transport.loop.startSeconds;
          restartAudioOnLoopRef.current = false;
        }
        audio.volume = 1;
        const playPromise = audio.play();
        if (playPromise) {
          void playPromise.catch(handlePlaybackError);
        }
      } catch {
        handlePlaybackError();
      }
    } else if (
      transport.phase === "armed" ||
      transport.phase === "paused" ||
      transport.phase === "idle"
    ) {
      if (!audio.paused) {
        audio.pause();
      }
      audio.volume = 1;
    }
    return undefined;
  }, [audioSourceUrl, handlePlaybackError, transport.phase, transport.loop]);

  useEffect(() => {
    if (!audioSourceUrl || transport.phase !== "looping" || !transport.loop) {
      return undefined;
    }
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }
    const loop = transport.loop;
    const playbackRate = transport.playbackRate;
    let boundaryTimer: number | undefined;
    /** Cancel the pending media-clock boundary check. */
    const clearBoundaryTimer = () => {
      if (boundaryTimer !== undefined) {
        window.clearTimeout(boundaryTimer);
        boundaryTimer = undefined;
      }
    };
    /** Restart media at the exact selected section boundary. */
    const restartLoop = () => {
      try {
        audio.currentTime = loop.startSeconds;
        const playPromise = audio.play();
        if (playPromise) {
          void playPromise.catch(handlePlaybackError);
        }
      } catch {
        handlePlaybackError();
        return;
      }
      scheduleLoopBoundary();
    };
    /** Schedule a media-clock boundary check and reschedule if timers fire early. */
    const scheduleLoopBoundary = () => {
      clearBoundaryTimer();
      const remainingSeconds = loop.endSeconds - audio.currentTime;
      if (!Number.isFinite(remainingSeconds)) {
        return;
      }
      if (remainingSeconds <= 0) {
        restartLoop();
        return;
      }
      boundaryTimer = window.setTimeout(() => {
        boundaryTimer = undefined;
        if (audio.currentTime >= loop.endSeconds) {
          restartLoop();
        } else {
          scheduleLoopBoundary();
        }
      },
        Math.min(
          (remainingSeconds / playbackRate) * 1000,
          2_147_483_647,
        ),
      );
    };
    /** Keep the map playhead aligned with the scoped audio element. */
    const syncPlayhead = () => {
      if (audio.currentTime >= loop.endSeconds) {
        restartLoop();
      } else {
        scheduleLoopBoundary();
      }
      setTransport((current) =>
        reduceRehearsalTransport(current, {
          type: "sync",
          playheadSeconds: audio.currentTime,
        }),
      );
    };
    /** Stop the transport when the media element can no longer play. */
    const failPlayback = () => handlePlaybackError();
    audio.addEventListener("timeupdate", syncPlayhead);
    audio.addEventListener("error", failPlayback);
    audio.addEventListener("ended", failPlayback);
    scheduleLoopBoundary();
    return () => {
      clearBoundaryTimer();
      audio.removeEventListener("timeupdate", syncPlayhead);
      audio.removeEventListener("error", failPlayback);
      audio.removeEventListener("ended", failPlayback);
    };
  }, [
    audioSourceUrl,
    handlePlaybackError,
    transport.phase,
    transport.loop,
    transport.playbackRate,
  ]);

  const actionKey = nextActionTemplateKey(transport, hasPlayableAudio);
  const nextAction =
    activeRoleName && playableLoops.length === 0
      ? fillRehearsalCopy(t("workspaceLoopNoRoleSections"), {
          roleName: activeRoleName,
        })
      : fillRehearsalCopy(
          t(actionKey as TranslationKey),
          nextActionValues(transport),
        );
  const sectionPickerLabel = activeRoleName
    ? fillRehearsalCopy(t("workspaceLoopSectionPickerForRole"), {
        roleName: activeRoleName,
      })
    : t("workspaceLoopSectionPickerLabel");
  const canStart =
    transport.loop !== null &&
    hasPlayableAudio &&
    (transport.phase === "armed" || transport.phase === "paused");
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
        role="status"
        aria-live="polite"
        data-testid="rehearsal-loop-next-action"
      >
        {nextAction}
      </p>
      {activeRoleName && playableLoops.length > 0 ? (
        <p
          className="mt-3 text-xs font-semibold text-cyan-100"
          data-testid="rehearsal-loop-role-filter"
        >
          {fillRehearsalCopy(t("workspaceLoopRoleFilterHint"), {
            roleName: activeRoleName,
          })}
        </p>
      ) : null}
      {playableLoops.length > 0 ? (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label={sectionPickerLabel}
        >
          {playableLoops.map((loop, index) => {
            const selected = index === selectedRendererIndex;
            return (
              <Button
                key={`rehearsal-loop-section-${index}`}
                type="button"
                variant={selected ? "default" : "outline"}
                size="sm"
                aria-pressed={selected}
                className={
                  selected
                    ? "min-h-10 border-cyan-300/30 bg-cyan-300 font-semibold text-slate-950"
                    : "min-h-10 border-white/10 bg-white/5 font-semibold text-slate-100"
                }
                onClick={() => setSelectedSectionIndex(index)}
              >
                <span>{loop.sectionLabel}</span>
                <span> · </span>
                <span>
                  {formatRehearsalClock(loop.startSeconds)}–
                  {formatRehearsalClock(loop.endSeconds)}
                </span>
              </Button>
            );
          })}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          <span>{t("workspaceLoopPlaybackRateLabel")}</span>
          <select
            aria-describedby="rehearsal-loop-playback-rate-hint"
            aria-label={t("workspaceLoopPlaybackRateLabel")}
            className="min-h-11 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm font-semibold normal-case tracking-normal text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            data-testid="rehearsal-loop-playback-rate"
            value={transport.playbackRate}
            onChange={(event) => {
              const nextRate = Number(event.currentTarget.value);
              if (isRehearsalPlaybackRate(nextRate)) {
                setTransport((current) =>
                  reduceRehearsalTransport(current, {
                    type: "set-playback-rate",
                    rate: nextRate,
                  }),
                );
              }
            }}
          >
            {rehearsalPlaybackRates().map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>
        <p
          className="text-xs text-slate-400"
          id="rehearsal-loop-playback-rate-hint"
        >
          {t("workspaceLoopPlaybackRateHint")}
        </p>
      </div>
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
            setPlaybackError(false);
            if (transport.loop) {
              startAudio(
                transport.loop,
                transport.phase === "paused" &&
                  transport.countInRemainingBeats === 0,
              );
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
      {playbackError ? (
        <p
          className="mt-3 text-sm font-semibold text-amber-200"
          role="alert"
          data-testid="rehearsal-loop-audio-error"
        >
          {t("workspaceLoopAudioError")}
        </p>
      ) : null}
      <audio
        ref={audioRef}
        data-testid="rehearsal-loop-audio"
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
    </section>
  );
}
