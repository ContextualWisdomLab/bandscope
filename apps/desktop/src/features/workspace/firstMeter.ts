import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

export /**
 * Inclusive lower bound for a rehearsal-usable meter numerator.
 */ const MIN_METER_BEATS = 1;
export /**
 * Inclusive upper bound so a malformed numerator cannot schedule unbounded clicks.
 */ const MAX_METER_BEATS = 16;
export /**
 * Written denominators admitted from the MusicXML time-signature contract.
 */ const TRUSTED_BEAT_TYPES = [1, 2, 4, 8, 16] as const;

/** Tonight's first named meter for the ready rehearsal map. */
export type FirstMeterPlan = {
  beats: number;
  beatType: number;
  label: string;
  countInBeats: number;
  sectionLabel?: string;
};

/** Stored song-level meter after lexical validation. */
export type TrustedMeter = {
  beats: number;
  beatType: number;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Admit a finite integer inside an inclusive rehearsal bound. */
function trustedInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

/**
 * Admit only a MusicXML-shaped time signature with integer beats and beat-type.
 *
 * Extra keys, non-integers, and unsupported denominators fail closed. This is
 * not a meter detector and does not invent MIR.
 */
export function trustedMeter(value: unknown): TrustedMeter | null {
  if (!isRuntimeObject(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== "beats" && key !== "beatType") {
      return null;
    }
  }

  const beats = trustedInteger(value.beats, MIN_METER_BEATS, MAX_METER_BEATS);
  const beatType = trustedInteger(value.beatType, 1, 16);
  if (beats === null || beatType === null) {
    return null;
  }
  if (!TRUSTED_BEAT_TYPES.includes(beatType as (typeof TRUSTED_BEAT_TYPES)[number])) {
    return null;
  }

  return { beats, beatType };
}

/**
 * Return how many clicks the room should count for this written meter.
 *
 * Compound meters whose numerator is a multiple of three (6/8, 9/8, 12/8)
 * count the dotted-quarter pulse. Every other admitted meter counts the
 * written numerator.
 */
export function countInBeatsForMeter(meter: TrustedMeter): number {
  if (meter.beatType === 8 && [6, 9, 12].includes(meter.beats)) {
    return meter.beats / 3;
  }
  return meter.beats;
}

/**
 * Return the first named section label, skipping blank/`none` sentinels.
 *
 * Runtime roots and collection members are untrusted. Malformed entries are
 * isolated instead of becoming meter-section authority.
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
 * Build tonight's first meter from a trusted stored time signature.
 *
 * Missing, extra-keyed, or unusable meter is not count-in authority. The
 * next action is still to count the first bar, then check the first range.
 */
export function firstMeterPlan(song: RehearsalSong | unknown): FirstMeterPlan | null {
  if (!isRuntimeObject(song)) {
    return null;
  }

  const meter = trustedMeter(song.meter);
  if (meter === null) {
    return null;
  }

  return {
    beats: meter.beats,
    beatType: meter.beatType,
    label: `${meter.beats}/${meter.beatType}`,
    countInBeats: countInBeatsForMeter(meter),
    sectionLabel: firstNamedSectionLabel(song)
  };
}

/** Fill trusted `{token}` placeholders once while keeping rehearsal values literal. */
export function fillMeterCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
