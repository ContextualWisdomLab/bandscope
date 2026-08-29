import type { RehearsalSong } from "@bandscope/shared-types";
import { meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first trusted click the band can set before the named section. */
export type FirstClickPlan = {
  tempoBpm: number;
  sectionLabel: string | null;
};

const MIN_REHEARSAL_TEMPO_BPM = 20;
const MAX_REHEARSAL_TEMPO_BPM = 400;

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Return a rehearsal-usable BPM or fail closed.
 *
 * Analysis payloads are untrusted. Non-finite, non-positive, and
 * out-of-range values are not click authority.
 */
export function trustedTempoBpm(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < MIN_REHEARSAL_TEMPO_BPM || value > MAX_REHEARSAL_TEMPO_BPM) {
    return null;
  }
  return value;
}

/** Render a trusted BPM so the player can set a click without leftover floats. */
export function formatTempoBpm(tempoBpm: number): string {
  return Number.isInteger(tempoBpm) ? String(tempoBpm) : String(Number(tempoBpm.toFixed(1)));
}

/**
 * Pick tonight's first click: a trusted song tempo plus the first named section.
 *
 * Runtime roots and collection members are treated as untrusted; malformed
 * evidence is isolated instead of becoming click-track authority.
 */
export function firstClickPlan(song: RehearsalSong): FirstClickPlan | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const tempoBpm = trustedTempoBpm(runtimeSong.tempo);
  if (tempoBpm === null) {
    return null;
  }

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionLabel) {
      continue;
    }
    return { tempoBpm, sectionLabel };
  }

  return { tempoBpm, sectionLabel: null };
}
