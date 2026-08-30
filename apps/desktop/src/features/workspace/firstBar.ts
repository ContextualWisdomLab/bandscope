import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

export /**
 * Inclusive lower bound for a printed-chart measure number.
 */ const MIN_MEASURE_START = 1;
export /**
 * Inclusive upper bound for a printed-chart measure number.
 *
 * This is a stored chart label bound, not a duration derived from audio.
 */ const MAX_MEASURE_START = 9_999;

/** Tonight's first named chart bar on the ready rehearsal map. */
export type FirstBarPlan = {
  measureStart: number;
  barLabel: string;
  sectionLabel?: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Admit only a finite integer chart bar inside the printed-score bound.
 *
 * Zero, negatives, fractions, strings, and out-of-range values fail closed.
 * This is not a downbeat detector and does not invent a bar from tempo.
 */
export function trustedMeasureStart(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < MIN_MEASURE_START || value > MAX_MEASURE_START) {
    return null;
  }
  return value;
}

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming bar-section authority.
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
 * Build tonight's first chart bar from a trusted stored measure number.
 *
 * Missing or unusable measureStart is not count-in authority. The next
 * action is still to name the first bar on the chart, then check the first
 * range.
 */
export function firstBarPlan(song: RehearsalSong | unknown): FirstBarPlan | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  for (const sectionValue of song.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }

    const measureStart = trustedMeasureStart(sectionValue.measureStart);
    if (measureStart === null) {
      continue;
    }

    return {
      measureStart,
      barLabel: String(measureStart),
      sectionLabel: meaningfulRangeText(sectionValue.label)
    };
  }

  return null;
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillBarCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
