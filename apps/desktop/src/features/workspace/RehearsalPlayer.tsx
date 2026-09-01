import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalSong,
} from "@bandscope/shared-types";
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
  onSongUpdate?: (song: RehearsalSong) => void;
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
    current.selectionKey === next.selectionKey &&
    current.sectionId === next.sectionId &&
    current.startSeconds === next.startSeconds &&
    current.endSeconds === next.endSeconds &&
    current.tempoBpm === next.tempoBpm &&
    current.countInBeats === next.countInBeats
  );
}

/** Return a stable selection key when analysis emits duplicate section IDs. */
function loopSelectionKey(loop: RehearsalLoopWindow): string {
  return loop.selectionKey;
}

/** Render tonight's first section loop with a count-in and a named next action. */
export function RehearsalPlayer({
  song,
  onSongUpdate,
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
  const [selectedLoopKey, setSelectedLoopKey] = useState<string | null>(null);
  const [boundaryError, setBoundaryError] = useState(false);
  const selectedLoop =
    playableLoops.find((loop) => loopSelectionKey(loop) === selectedLoopKey) ??
    playableLoops[0] ??
    null;
  const selectedBoundaryKey = selectedLoop ? loopSelectionKey(selectedLoop) : null;
  const [boundaryDraft, setBoundaryDraft] = useState(() => ({
    end: selectedLoop ? String(selectedLoop.endSeconds) : "",
    start: selectedLoop ? String(selectedLoop.startSeconds) : "",
  }));
  useEffect(() => {
    setBoundaryError(false);
    setBoundaryDraft({
      end: selectedLoop ? String(selectedLoop.endSeconds) : "",
      start: selectedLoop ? String(selectedLoop.startSeconds) : "",
    });
  }, [selectedBoundaryKey, selectedLoop?.endSeconds, selectedLoop?.startSeconds]);
  const handleSectionKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      const focusedIndex = Number(event.currentTarget.dataset.loopIndex);
      const selectedIndex = selectedLoop
        ? playableLoops.indexOf(selectedLoop)
        : -1;
      const currentIndex =
        Number.isSafeInteger(focusedIndex) &&
        focusedIndex >= 0 &&
        focusedIndex < playableLoops.length
          ? focusedIndex
          : selectedIndex;
      const nextIndex =
        currentIndex + (event.key === "ArrowRight" ? 1 : -1);
      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= playableLoops.length
      ) {
        return;
      }
      event.preventDefault();
      const nextLoop = playableLoops[nextIndex];
      setSelectedLoopKey(loopSelectionKey(nextLoop));
      document
        .getElementById(
          `rehearsal-loop-section-${loopSelectionKey(nextLoop)}-${nextIndex}`,
        )
        ?.focus();
    },
    [playableLoops, selectedLoop],
  );
  const [transport, setTransport] = useState<RehearsalTransportState>(() =>
    reduceRehearsalTransport(createIdleTransportState(), {
      type: "arm",
      loop: playableLoops[0] ?? null,
    }),
  );
  const lastHandledStartNonce = useRef(0);
  const restartAudioOnLoopRef = useRef(false);
  const countInBeatRef = useRef<{
    durationMs: number;
    startedAt: number;
    remainingBeats: number;
    progress: number;
  } | null>(null);
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
    setTransport((current) => {
      if (
        current.loop &&
        selectedLoop &&
        hasSameLoopTiming(current.loop, selectedLoop)
      ) {
        if (
          current.loop.sectionLabel === selectedLoop.sectionLabel &&
          current.loop.tempoAssumed === selectedLoop.tempoAssumed &&
          current.loop.sourceIndex === selectedLoop.sourceIndex
        ) {
          return current;
        }
        return { ...current, loop: selectedLoop };
      }
      return reduceRehearsalTransport(current, {
        type: "arm",
        loop: selectedLoop,
      });
    });
  }, [selectedLoop]);

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
    selectedLoop,
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
      countInBeatRef.current = null;
      return undefined;
    }
    const durationMs =
      beatDurationMs(transport.loop.tempoBpm) / transport.playbackRate;
    const now = performance.now();
    const previous = countInBeatRef.current;
    const sameBeat =
      previous?.remainingBeats === transport.countInRemainingBeats;
    const elapsedProgress = sameBeat
      ? Math.max(0, now - previous.startedAt) / previous.durationMs
      : 0;
    const progress = sameBeat
      ? Math.min(1, previous.progress + elapsedProgress)
      : 0;
    countInBeatRef.current = {
      durationMs,
      startedAt: now,
      remainingBeats: transport.countInRemainingBeats,
      progress,
    };
    let timer: number | undefined;
    /** Schedule the next count-in beat without coupling it to React commits. */
    const scheduleBeat = (delayMs: number) => {
      timer = window.setTimeout(() => {
        const current = countInBeatRef.current;
        if (!current || current.remainingBeats <= 0) {
          return;
        }
        current.remainingBeats -= 1;
        current.progress = 0;
        setTransport((state) => reduceRehearsalTransport(state, { type: "beat" }));
        if (current.remainingBeats > 0) {
          current.startedAt = performance.now();
          scheduleBeat(current.durationMs);
        }
      }, delayMs);
    };
    scheduleBeat(Math.ceil(Math.max(0, durationMs * (1 - progress))));
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [
    transport.loop,
    transport.phase,
    transport.playbackRate,
  ]);

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
  const handleBoundaryBlur = useCallback(
    (boundary: "start" | "end", event: FocusEvent<HTMLInputElement>) => {
      if (!selectedLoop || !onSongUpdate) {
        return;
      }
      const rawValue = event.currentTarget.value.trim();
      const value = Number(rawValue);
      const valid =
        rawValue !== "" &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= MAX_SECTION_TIME_SECONDS &&
        (boundary === "start"
          ? value < selectedLoop.endSeconds
          : value > selectedLoop.startSeconds);
      if (!valid) {
        const currentValue =
          boundary === "start"
            ? selectedLoop.startSeconds
            : selectedLoop.endSeconds;
        setBoundaryDraft((current) => ({
          ...current,
          [boundary]: String(currentValue),
        }));
        setBoundaryError(true);
        return;
      }

      setBoundaryError(false);
      const currentValue =
        boundary === "start"
          ? selectedLoop.startSeconds
          : selectedLoop.endSeconds;
      if (value === currentValue) {
        setBoundaryDraft((current) => ({
          ...current,
          [boundary]: String(currentValue),
        }));
        return;
      }

      const sectionIndex = selectedLoop.sourceIndex;
      const section = song.sections[sectionIndex];
      if (
        !section ||
        section.id !== selectedLoop.sectionId ||
        section.timeRange.start !== selectedLoop.startSeconds ||
        section.timeRange.end !== selectedLoop.endSeconds
      ) {
        return;
      }
      const nextSong = {
        ...song,
        sections: song.sections.map((currentSection, index) =>
          index === sectionIndex
            ? {
                ...section,
                timeRange: {
                  ...section.timeRange,
                  [boundary]: value,
                },
              }
            : currentSection,
        ),
      };
      const nextLoop =
        boundary === "start"
          ? { ...selectedLoop, startSeconds: value }
          : { ...selectedLoop, endSeconds: value };
      setBoundaryDraft((current) => ({
        ...current,
        [boundary]: String(value),
      }));
      setSelectedLoopKey(loopSelectionKey(nextLoop));
      onSongUpdate(nextSong);
    },
    [onSongUpdate, selectedLoop, song],
  );
  const canSeek =
    transport.loop !== null &&
    hasPlayableAudio &&
    (transport.phase === "looping" ||
      (transport.phase === "paused" && transport.countInRemainingBeats === 0));
  const handleSeek = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!canSeek || !transport.loop || !audioSourceUrl) {
        return;
      }
      const nextTransport = reduceRehearsalTransport(transport, {
        type: "seek",
        playheadSeconds: Number(event.currentTarget.value),
      });
      try {
        const audio = audioRef.current;
        if (!audio) {
          return;
        }
        audio.currentTime = nextTransport.playheadSeconds;
        setPlaybackError(false);
        setTransport(nextTransport);
      } catch {
        handlePlaybackError();
      }
    },
    [audioSourceUrl, canSeek, handlePlaybackError, transport],
  );
  const startOrResume = useCallback(() => {
    if (!canStart) {
      return;
    }
    setPlaybackError(false);
    if (transport.loop) {
      startAudio(
        transport.loop,
        transport.phase === "paused" && transport.countInRemainingBeats === 0,
      );
    }
    setTransport((current) =>
      reduceRehearsalTransport(current, { type: "start" }),
    );
  }, [canStart, startAudio, transport]);
  const stopTransport = useCallback(() => {
    if (!canStop) {
      return;
    }
    setTransport((current) =>
      reduceRehearsalTransport(current, { type: "stop" }),
    );
  }, [canStop]);
  useEffect(() => {
    /** Keep transport shortcuts out of editable controls. */
    const handleTransportShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const targetIsButtonOrLink =
        target instanceof Element && target.closest("button, a") !== null;
      const targetIsScrollableRegion =
        target instanceof Element &&
        target.closest('[role="region"][tabindex="0"]') !== null;
      const targetIsEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, select, textarea") !== null);
      if (
        event.defaultPrevented ||
        event.repeat ||
        targetIsEditable
      ) {
        return;
      }
      if (
        event.key === " " &&
        !targetIsButtonOrLink &&
        !targetIsScrollableRegion &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (canPause || canStart)
      ) {
        event.preventDefault();
        if (canPause) {
          setTransport((current) =>
            reduceRehearsalTransport(current, { type: "pause" }),
          );
        } else {
          startOrResume();
        }
      } else if (
        event.key === "Escape" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        canStop
      ) {
        event.preventDefault();
        stopTransport();
      }
    };
    window.addEventListener("keydown", handleTransportShortcut);
    return () => window.removeEventListener("keydown", handleTransportShortcut);
  }, [canPause, canStart, canStop, startOrResume, stopTransport]);

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
            const selectionKey = loopSelectionKey(loop);
            const selected =
              selectedLoop !== null &&
              selectionKey === loopSelectionKey(selectedLoop);
            return (
              <Button
                key={`rehearsal-loop-section-${selectionKey}-${index}`}
                type="button"
                variant={selected ? "default" : "outline"}
                size="sm"
                id={`rehearsal-loop-section-${selectionKey}-${index}`}
                data-loop-index={index}
                aria-pressed={selected}
                aria-keyshortcuts="ArrowLeft ArrowRight"
                className={
                  selected
                    ? "min-h-10 border-cyan-300/30 bg-cyan-300 font-semibold text-slate-950"
                    : "min-h-10 border-white/10 bg-white/5 font-semibold text-slate-100"
                }
                onClick={() => setSelectedLoopKey(selectionKey)}
                onKeyDown={handleSectionKeyDown}
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
      {playableLoops.length > 1 ? (
        <p
          className="mt-2 text-xs text-slate-400"
          data-testid="rehearsal-loop-keyboard-hint"
        >
          {t("workspaceLoopSectionKeyboardHint")}
        </p>
      ) : null}
      {selectedLoop && onSongUpdate ? (
        <div
          className="mt-3 rounded-xl border border-indigo-300/20 bg-indigo-300/[0.06] p-3"
          data-testid="rehearsal-loop-boundary-editor"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-indigo-100">
              {t("workspaceLoopBoundaryTitle")}
            </p>
            <span className="rounded-full border border-indigo-200/20 bg-indigo-200/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-indigo-100">
              {t("workspaceLoopBoundaryCorrectionBadge")}
            </span>
          </div>
          <p
            className={`mt-2 text-xs ${boundaryError ? "text-amber-200" : "text-slate-400"}`}
            id="rehearsal-loop-boundary-hint"
          >
            {boundaryError
              ? t("workspaceLoopBoundaryError")
              : t("workspaceLoopBoundaryHint")}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-slate-300">
              <span>{t("workspaceLoopBoundaryStartLabel")}</span>
              <input
                aria-describedby="rehearsal-loop-boundary-hint"
                aria-invalid={boundaryError}
                className="min-h-11 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                id="rehearsal-loop-boundary-start"
                max={MAX_SECTION_TIME_SECONDS}
                min={0}
                onBlur={(event) => handleBoundaryBlur("start", event)}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setBoundaryDraft((current) => ({ ...current, start: value }));
                }}
                step={1}
                type="number"
                value={boundaryDraft.start}
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-slate-300">
              <span>{t("workspaceLoopBoundaryEndLabel")}</span>
              <input
                aria-describedby="rehearsal-loop-boundary-hint"
                aria-invalid={boundaryError}
                className="min-h-11 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm font-semibold text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                id="rehearsal-loop-boundary-end"
                max={MAX_SECTION_TIME_SECONDS}
                min={0}
                onBlur={(event) => handleBoundaryBlur("end", event)}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setBoundaryDraft((current) => ({ ...current, end: value }));
                }}
                step={1}
                type="number"
                value={boundaryDraft.end}
              />
            </label>
          </div>
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
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <label
          className="flex flex-col gap-2 text-xs font-semibold text-slate-300"
          htmlFor="rehearsal-loop-seek"
        >
          <span>{t("workspaceLoopSeekLabel")}</span>
          <input
            aria-describedby="rehearsal-loop-seek-hint"
            aria-disabled={!canSeek}
            className="accent-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="rehearsal-loop-seek"
            disabled={!canSeek}
            id="rehearsal-loop-seek"
            max={transport.loop?.endSeconds ?? 0}
            min={transport.loop?.startSeconds ?? 0}
            onChange={handleSeek}
            step={0.1}
            type="range"
            value={transport.playheadSeconds}
          />
        </label>
        <p className="mt-2 text-xs text-slate-400" id="rehearsal-loop-seek-hint">
          {t("workspaceLoopSeekHint")}
        </p>
      </div>
      <p className="mt-3 text-xs text-slate-400" data-testid="rehearsal-loop-transport-keyboard-hint">
        {t("workspaceLoopTransportKeyboardHint")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!canStart}
          aria-disabled={!canStart}
          className="min-h-11 border-cyan-300/30 bg-cyan-300/15 font-semibold text-cyan-50 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={startOrResume}
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
          onClick={stopTransport}
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
