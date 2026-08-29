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

/** Read one own data-property value without invoking accessors or Proxy get traps. */
function ownDataValue(record: Record<string, unknown>, property: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, property);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

/** Snapshot own section slots without invoking array index or iteration get traps. */
function ownSectionValues(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  } catch {
    return null;
  }
  const length =
    lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
    return null;
  }

  const sections: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor && "value" in descriptor) {
        sections.push(descriptor.value);
      }
    } catch {
      return null;
    }
  }
  return sections;
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
 * Runtime roots and collection members are treated as untrusted; only snapshotted
 * own data-property values can become click-track authority. Malformed evidence is
 * isolated instead of becoming buyer-visible guidance.
 */
export function firstClickPlan(song: RehearsalSong): FirstClickPlan | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong)) {
    return null;
  }

  const sections = ownSectionValues(ownDataValue(runtimeSong, "sections"));
  if (sections === null) {
    return null;
  }

  const tempoBpm = trustedTempoBpm(ownDataValue(runtimeSong, "tempo"));
  if (tempoBpm === null) {
    return null;
  }

  for (const sectionValue of sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(ownDataValue(sectionValue, "label"));
    if (!sectionLabel) {
      continue;
    }
    return { tempoBpm, sectionLabel };
  }

  return { tempoBpm, sectionLabel: null };
}