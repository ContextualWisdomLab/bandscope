import type { RehearsalSection, RehearsalSong } from "@bandscope/shared-types";

const DEFAULT_REHEARSAL_TEMPO_BPM = 120;
const DEFAULT_COUNT_IN_BEATS = 4;
const MIN_REHEARSAL_TEMPO_BPM = 30;
const MAX_REHEARSAL_TEMPO_BPM = 300;

/** Documented rehearsal transport phases for the first section loop. */
export type RehearsalTransportPhase =
  "idle" | "armed" | "counting-in" | "looping" | "paused";

/** Bounded loop window derived from one valid analyzed section. */
export interface RehearsalLoopWindow {
  sectionId: string;
  sectionLabel: string;
  startSeconds: number;
  endSeconds: number;
  tempoBpm: number;
  tempoAssumed: boolean;
  countInBeats: number;
}

/** Deterministic transport snapshot used by the rehearsal player. */
export interface RehearsalTransportState {
  phase: RehearsalTransportPhase;
  loop: RehearsalLoopWindow | null;
  countInRemainingBeats: number;
  playheadSeconds: number;
}

/** Discrete transport commands that never inspect the filesystem. */
export type RehearsalTransportEvent =
  | { type: "arm"; loop: RehearsalLoopWindow | null }
  | { type: "start" }
  | { type: "beat" }
  | { type: "tick"; deltaSeconds: number }
  | { type: "pause" }
  | { type: "stop" };

type PlayableSectionSnapshot = Readonly<{
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
}>;

/** Return true only for finite numeric values greater than or equal to zero. */
export function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Read one own data-property value without activating accessors or Proxy get traps. */
function ownDataValue(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined &&
      Object.prototype.hasOwnProperty.call(descriptor, "value")
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

/** Snapshot one playable section before any value can become transport authority. */
function playableSectionSnapshot(
  section: RehearsalSection | undefined | null,
): PlayableSectionSnapshot | null {
  if (!section || typeof section !== "object") {
    return null;
  }
  const id = ownDataValue(section, "id");
  const label = ownDataValue(section, "label");
  const timeRange = ownDataValue(section, "timeRange");
  if (
    typeof id !== "string" ||
    id.trim() === "" ||
    !timeRange ||
    typeof timeRange !== "object"
  ) {
    return null;
  }
  const start = ownDataValue(timeRange, "start");
  const end = ownDataValue(timeRange, "end");
  if (
    !isFiniteNonNegativeNumber(start) ||
    !isFiniteNonNegativeNumber(end) ||
    end <= start
  ) {
    return null;
  }
  return {
    id,
    label: typeof label === "string" && label.trim() ? label : id,
    startSeconds: start,
    endSeconds: end,
  };
}

/** Return whether a section exposes a usable closed loop window. */
export function isPlayableLoopSection(
  section: RehearsalSection | undefined | null,
): boolean {
  return playableSectionSnapshot(section) !== null;
}

/** Admit a published tempo or fall back to the labeled rehearsal default. */
export function resolveRehearsalTempo(tempo: unknown): {
  tempoBpm: number;
  tempoAssumed: boolean;
} {
  if (
    typeof tempo === "number" &&
    Number.isFinite(tempo) &&
    tempo >= MIN_REHEARSAL_TEMPO_BPM &&
    tempo <= MAX_REHEARSAL_TEMPO_BPM
  ) {
    return { tempoBpm: tempo, tempoAssumed: false };
  }
  return { tempoBpm: DEFAULT_REHEARSAL_TEMPO_BPM, tempoAssumed: true };
}

/** Convert one beat at the admitted tempo into milliseconds. */
export function beatDurationMs(tempoBpm: number): number {
  const admitted = resolveRehearsalTempo(tempoBpm).tempoBpm;
  return 60_000 / admitted;
}

/** Convert one beat at the admitted tempo into seconds. */
export function beatDurationSeconds(tempoBpm: number): number {
  return beatDurationMs(tempoBpm) / 1000;
}

/** Format a bounded clock as m:ss for the rehearsal map. */
export function formatRehearsalClock(totalSeconds: number): string {
  const safeSeconds = isFiniteNonNegativeNumber(totalSeconds)
    ? totalSeconds
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Build a loop window from one snapshotted section plus the song tempo. */
export function createLoopWindow(
  section: RehearsalSection,
  tempo: unknown,
): RehearsalLoopWindow | null {
  const snapshot = playableSectionSnapshot(section);
  if (!snapshot) {
    return null;
  }
  const { tempoBpm, tempoAssumed } = resolveRehearsalTempo(tempo);
  return {
    sectionId: snapshot.id,
    sectionLabel: snapshot.label,
    startSeconds: snapshot.startSeconds,
    endSeconds: snapshot.endSeconds,
    tempoBpm,
    tempoAssumed,
    countInBeats: DEFAULT_COUNT_IN_BEATS,
  };
}

/** Resolve the requested section, or the first valid section, as a loop window. */
export function resolveLoopWindow(
  song: RehearsalSong | null | undefined,
  sectionId?: string | null,
): RehearsalLoopWindow | null {
  const sections = Array.isArray(song?.sections) ? song.sections : [];
  const tempo = song?.tempo;
  const windows = sections.flatMap((section) => {
    const window = createLoopWindow(section, tempo);
    return window ? [window] : [];
  });
  if (typeof sectionId === "string" && sectionId.trim()) {
    const requestedWindow = windows.find(
      (window) => window.sectionId === sectionId,
    );
    if (requestedWindow) {
      return requestedWindow;
    }
  }
  return windows[0] ?? null;
}

/** Return the idle transport snapshot. */
export function createIdleTransportState(): RehearsalTransportState {
  return {
    phase: "idle",
    loop: null,
    countInRemainingBeats: 0,
    playheadSeconds: 0,
  };
}

/** Wrap a looping playhead back to the loop start without overshooting the end. */
export function wrapPlayhead(
  playheadSeconds: number,
  loop: RehearsalLoopWindow,
): number {
  const duration = loop.endSeconds - loop.startSeconds;
  if (!(duration > 0) || !Number.isFinite(playheadSeconds)) {
    return loop.startSeconds;
  }
  const elapsed = playheadSeconds - loop.startSeconds;
  const wrapped = ((elapsed % duration) + duration) % duration;
  return loop.startSeconds + wrapped;
}

/** Advance the transport without touching audio files or native paths. */
export function reduceRehearsalTransport(
  state: RehearsalTransportState,
  event: RehearsalTransportEvent,
): RehearsalTransportState {
  switch (event.type) {
    case "arm": {
      if (!event.loop) {
        return createIdleTransportState();
      }
      return {
        phase: "armed",
        loop: event.loop,
        countInRemainingBeats: event.loop.countInBeats,
        playheadSeconds: event.loop.startSeconds,
      };
    }
    case "start": {
      if (!state.loop) {
        return state;
      }
      if (state.phase === "paused") {
        return {
          ...state,
          phase:
            state.countInRemainingBeats > 0 ? "counting-in" : "looping",
        };
      }
      return {
        ...state,
        phase: "counting-in",
        countInRemainingBeats: state.loop.countInBeats,
        playheadSeconds: state.loop.startSeconds,
      };
    }
    case "beat": {
      if (state.phase !== "counting-in" || !state.loop) {
        return state;
      }
      const remaining = state.countInRemainingBeats - 1;
      if (remaining <= 0) {
        return {
          ...state,
          phase: "looping",
          countInRemainingBeats: 0,
          playheadSeconds: state.loop.startSeconds,
        };
      }
      return { ...state, countInRemainingBeats: remaining };
    }
    case "tick": {
      if (state.phase !== "looping" || !state.loop) {
        return state;
      }
      const delta = Number.isFinite(event.deltaSeconds)
        ? Math.max(0, event.deltaSeconds)
        : 0;
      return {
        ...state,
        playheadSeconds: wrapPlayhead(
          state.playheadSeconds + delta,
          state.loop,
        ),
      };
    }
    case "pause": {
      if (state.phase !== "looping" && state.phase !== "counting-in") {
        return state;
      }
      return { ...state, phase: "paused" };
    }
    case "stop": {
      if (!state.loop) {
        return createIdleTransportState();
      }
      return {
        phase: "armed",
        loop: state.loop,
        countInRemainingBeats: state.loop.countInBeats,
        playheadSeconds: state.loop.startSeconds,
      };
    }
    default:
      return state;
  }
}

/** Fill `{name}` placeholders in a rehearsal next-action template. */
export function fillRehearsalCopy(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{([a-zA-Z]+)\}/g,
    (_match, name: string) => values[name] ?? "",
  );
}

/** Choose the next-action template key for the current transport snapshot. */
export function nextActionTemplateKey(
  state: RehearsalTransportState,
  hasLocalAudio: boolean,
):
  | "workspaceLoopIdle"
  | "workspaceLoopArmedNoAudio"
  | "workspaceLoopArmedWithAudio"
  | "workspaceLoopCountingIn"
  | "workspaceLoopPlaying"
  | "workspaceLoopPaused" {
  if (!state.loop || state.phase === "idle") {
    return "workspaceLoopIdle";
  }
  if (state.phase === "counting-in") {
    return "workspaceLoopCountingIn";
  }
  if (state.phase === "looping") {
    return "workspaceLoopPlaying";
  }
  if (state.phase === "paused") {
    return "workspaceLoopPaused";
  }
  return hasLocalAudio
    ? "workspaceLoopArmedWithAudio"
    : "workspaceLoopArmedNoAudio";
}

/** Build the placeholder map for the current loop window. */
export function nextActionValues(
  state: RehearsalTransportState,
): Record<string, string> {
  if (!state.loop) {
    return {};
  }
  return {
    section: state.loop.sectionLabel,
    start: formatRehearsalClock(state.loop.startSeconds),
    end: formatRehearsalClock(state.loop.endSeconds),
    beats: String(state.countInRemainingBeats || state.loop.countInBeats),
    tempo: String(state.loop.tempoBpm),
  };
}
