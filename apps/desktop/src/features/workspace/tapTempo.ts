import { fillRangeCopy } from "./firstRangeSqueeze";

/** Inclusive lower bound for a rehearsal-usable tap tempo. */
export const MIN_TRUSTED_TEMPO_BPM = 20;
/** Inclusive upper bound for a rehearsal-usable tap tempo. */
export const MAX_TRUSTED_TEMPO_BPM = 400;
/** Four taps yield three intervals, the minimum for a median BPM. */
export const MIN_TAP_COUNT = 4;
/** Sliding window so a long groove cannot grow without bound. */
export const MAX_TAP_HISTORY = 8;
/** A pause longer than a 20 BPM interval starts a new tap group. */
export const TAP_GAP_RESET_MS = 3_500;
/** Reject a window whose fastest and slowest intervals disagree by more than 2×. */
export const MAX_INTERVAL_SPREAD = 2;

/** Session-only tap timestamps. Never persisted onto the song contract. */
export type TapTempoState = {
  tapsMs: number[];
};

/** Trusted count-in tempo measured from the player's taps. */
export type TapTempoReading = {
  tempoBpm: number;
  tapCount: number;
  intervalMs: number;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Admit a finite non-negative millisecond timestamp. */
function trustedTimestampMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

/** Copy finite tap timestamps out of an untrusted state object. */
function trustedTapTimestamps(value: unknown): number[] {
  if (!isRuntimeObject(value) || !Array.isArray(value.tapsMs)) {
    return [];
  }

  const taps: number[] = [];
  for (const item of value.tapsMs) {
    const timestamp = trustedTimestampMs(item);
    if (timestamp === null) {
      continue;
    }
    taps.push(timestamp);
  }
  return taps;
}

/** Median of a non-empty finite number list. */
function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }
  return sorted[middle]!;
}

/**
 * Admit only a finite rehearsal-usable BPM in 20–400.
 *
 * Non-numeric, non-finite, non-positive, and out-of-range values are not
 * click authority. This is not a tempo detector and does not invent MIR.
 */
export function trustedTempoBpm(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < MIN_TRUSTED_TEMPO_BPM || value > MAX_TRUSTED_TEMPO_BPM) {
    return null;
  }
  return value;
}

/** Empty session tap window. */
export function emptyTapTempo(): TapTempoState {
  return { tapsMs: [] };
}

/**
 * Record one tap, fail closed on a bad clock, and reset after a long pause.
 *
 * Runtime clocks and prior state are untrusted. A backwards or non-finite
 * timestamp is ignored. A gap longer than `TAP_GAP_RESET_MS` starts a new
 * window so a late entrance cannot drag the median.
 */
export function recordTap(state: TapTempoState | unknown, nowMs: unknown): TapTempoState {
  const timestamp = trustedTimestampMs(nowMs);
  const taps = trustedTapTimestamps(state);
  if (timestamp === null) {
    return { tapsMs: taps };
  }

  const last = taps[taps.length - 1];
  if (last !== undefined) {
    if (timestamp <= last) {
      return { tapsMs: taps };
    }
    if (timestamp - last > TAP_GAP_RESET_MS) {
      return { tapsMs: [timestamp] };
    }
  }

  taps.push(timestamp);
  if (taps.length > MAX_TAP_HISTORY) {
    taps.splice(0, taps.length - MAX_TAP_HISTORY);
  }
  return { tapsMs: taps };
}

/**
 * Read a trusted BPM from at least four taps, fail closed otherwise.
 *
 * Uses the median interval so one rushed or late tap cannot own the tempo.
 * A window whose intervals disagree by more than 2× is unsteady, not a click.
 */
export function tapTempoReading(state: TapTempoState | unknown): TapTempoReading | null {
  const taps = trustedTapTimestamps(state);
  if (taps.length < MIN_TAP_COUNT) {
    return null;
  }

  const intervals: number[] = [];
  for (let index = 1; index < taps.length; index += 1) {
    const interval = taps[index]! - taps[index - 1]!;
    if (!Number.isFinite(interval) || interval <= 0) {
      return null;
    }
    intervals.push(interval);
  }

  const fastest = Math.min(...intervals);
  const slowest = Math.max(...intervals);
  if (fastest <= 0 || slowest / fastest > MAX_INTERVAL_SPREAD) {
    return null;
  }

  const intervalMs = median(intervals);
  const tempoBpm = Math.round(60_000 / intervalMs);
  if (trustedTempoBpm(tempoBpm) === null) {
    return null;
  }

  return {
    tempoBpm,
    tapCount: taps.length,
    intervalMs: 60_000 / tempoBpm
  };
}

/**
 * Return whether the ready map still needs a session tap tempo.
 *
 * Missing, non-finite, or out-of-range `song.tempo` is not click authority.
 * A trusted stored tempo hides the tap control so it cannot override analysis.
 */
export function songNeedsTapTempo(song: unknown): boolean {
  if (!isRuntimeObject(song)) {
    return true;
  }
  return trustedTempoBpm(song.tempo) === null;
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillTapCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
