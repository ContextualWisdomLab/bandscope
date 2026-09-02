import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named stop on the rehearsal map. */
export type FirstStop = {
  sectionId: string;
  sectionLabel: string;
  previousSectionLabel?: string;
  nextSectionLabel?: string;
};

const STOP_LABEL = "stop";

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Pick the first named stop the band should cut together before the next entrance.
 *
 * Runtime roots and collection members are untrusted. Missing or duplicate
 * section identities fail closed so a later stop cannot steal another card.
 * Only the canonical form label `stop` becomes rehearsal-map authority;
 * groove text and cue wording never invent a stop.
 */
export function firstStop(song: RehearsalSong): FirstStop | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const seenSectionIds = new Set<string>();
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      return null;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    if (!sectionId) {
      return null;
    }
    if (seenSectionIds.has(sectionId)) {
      return null;
    }
    seenSectionIds.add(sectionId);
  }

  type NamedSection = {
    sectionId: string;
    sectionLabel: string;
  };

  const namedSections: NamedSection[] = [];
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      return null;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionId) {
      return null;
    }
    namedSections.push({
      sectionId,
      sectionLabel: sectionLabel ?? ""
    });
  }

  for (let index = 0; index < namedSections.length; index += 1) {
    const current = namedSections[index];
    if (!current || current.sectionLabel !== STOP_LABEL) {
      continue;
    }

    const previousLabel = namedSections[index - 1]?.sectionLabel;
    const nextLabel = namedSections[index + 1]?.sectionLabel;

    return {
      sectionId: current.sectionId,
      sectionLabel: current.sectionLabel,
      previousSectionLabel: previousLabel ? previousLabel : undefined,
      nextSectionLabel: nextLabel ? nextLabel : undefined
    };
  }

  return null;
}

/** Fill trusted `{token}` placeholders for stop rehearsal copy. */
export function fillStopCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}

/** True when this stable section identity owns tonight's first-stop action. */
export function isStopTarget(stop: FirstStop, sectionId: string): boolean {
  const identity = meaningfulRangeText(sectionId);
  return Boolean(identity) && identity === stop.sectionId;
}

/** Tokens for the buyer-visible stop callout and roadmap next action. */
export function stopCopyValues(stop: FirstStop): Record<string, string> {
  return {
    sectionLabel: stop.sectionLabel,
    previousSectionLabel: stop.previousSectionLabel ?? "",
    nextSectionLabel: stop.nextSectionLabel ?? ""
  };
}
