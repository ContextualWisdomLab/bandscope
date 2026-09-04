import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

export /**
 * Inclusive lower bound for a rehearsal-usable click tempo.
 */ const MIN_TRUSTED_TEMPO_BPM = 20;
export /**
 * Inclusive upper bound for a rehearsal-usable click tempo.
 */ const MAX_TRUSTED_TEMPO_BPM = 400;
export /**
 * Default count-in length when meter is not present on the song contract.
 */ const DEFAULT_COUNT_IN_BEATS = 4;
export /**
 * Hard ceiling so a malformed beat count cannot schedule unbounded clicks.
 */ const MAX_COUNT_IN_BEATS = 16;

/** Tonight's first audible count-in plan for the ready rehearsal map. */
export type FirstCountInPlan = {
  tempoBpm: number;
  beats: number;
  intervalMs: number;
  sectionLabel?: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming count-in section authority.
 */
export function firstNamedSectionLabel(song: unknown): string | undefined {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return undefined;
  }

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const label = meaningfulRangeText(sectionValue.label);
    if (label) {
      return label;
    }
  }

  return undefined;
}

/**
 * Build tonight's count-in from a trusted tempo, fail closed otherwise.
 *
 * Prefers a named first section so the click lands before a real entrance.
 * Missing or unusable tempo is not a playable click.
 */
export function firstCountInPlan(song: RehearsalSong | unknown): FirstCountInPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const tempoBpm = trustedTempoBpm(song.tempo);
  if (tempoBpm === null) {
    return null;
  }

  return {
    tempoBpm,
    beats: DEFAULT_COUNT_IN_BEATS,
    intervalMs: 60_000 / tempoBpm,
    sectionLabel: firstNamedSectionLabel(song)
  };
}

/**
 * Return millisecond onsets for each count-in beat, fail closed on bad plans.
 */
export function countInOnsetsMs(plan: FirstCountInPlan | unknown): number[] {
  if (!isRuntimeObject(plan)) {
    return [];
  }

  const beats = plan.beats;
  const intervalMs = plan.intervalMs;
  if (typeof beats !== "number" || !Number.isFinite(beats) || beats < 1 || beats > MAX_COUNT_IN_BEATS) {
    return [];
  }
  if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return [];
  }

  const onsets: number[] = [];
  const safeBeats = Math.floor(beats);
  for (let beat = 0; beat < safeBeats; beat += 1) {
    const onsetMs = beat * intervalMs;
    if (!Number.isFinite(onsetMs)) {
      return [];
    }
    onsets.push(onsetMs);
  }
  return onsets;
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillCountInCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
