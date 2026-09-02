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
const UNNAMED_SECTION_LABEL = "none";

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(runtimeValue: unknown): runtimeValue is Record<string, unknown> {
  return typeof runtimeValue === "object" && runtimeValue !== null && !Array.isArray(runtimeValue);
}

/**
 * Pick the first named stop the band should cut together before the next entrance.
 *
 * Runtime roots and collection members are untrusted. Missing or duplicate
 * section identities fail closed so a later stop cannot steal another card.
 * Only the canonical form label `stop` becomes rehearsal-map authority;
 * groove text and cue wording never invent a stop.
 */
export function firstStop(rehearsalSong: RehearsalSong): FirstStop | null {
  const runtimeSong: unknown = rehearsalSong;
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
    const runtimeSectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionId) {
      return null;
    }
    namedSections.push({
      sectionId,
      sectionLabel: runtimeSectionLabel === UNNAMED_SECTION_LABEL ? "" : runtimeSectionLabel ?? ""
    });
  }

  for (let sectionIndex = 0; sectionIndex < namedSections.length; sectionIndex += 1) {
    const currentSection = namedSections[sectionIndex];
    if (!currentSection || currentSection.sectionLabel !== STOP_LABEL) {
      continue;
    }

    const previousSectionLabel = namedSections[sectionIndex - 1]?.sectionLabel;
    const nextSectionLabel = namedSections[sectionIndex + 1]?.sectionLabel;

    return {
      sectionId: currentSection.sectionId,
      sectionLabel: currentSection.sectionLabel,
      previousSectionLabel: previousSectionLabel || undefined,
      nextSectionLabel: nextSectionLabel || undefined
    };
  }

  return null;
}

/** Fill trusted `{token}` placeholders for stop rehearsal copy. */
export function fillStopCopy(copyTemplate: string, copyValues: Record<string, string>): string {
  return fillRangeCopy(copyTemplate, copyValues);
}

/** True when this stable section identity owns tonight's first-stop action. */
export function isStopTarget(firstStopResult: FirstStop, sectionId: string): boolean {
  const normalizedSectionId = meaningfulRangeText(sectionId);
  return Boolean(normalizedSectionId) && normalizedSectionId === firstStopResult.sectionId;
}

/** Tokens for the buyer-visible stop callout and roadmap next action. */
export function stopCopyValues(firstStopResult: FirstStop): Record<string, string> {
  return {
    sectionLabel: firstStopResult.sectionLabel,
    previousSectionLabel: firstStopResult.previousSectionLabel ?? "",
    nextSectionLabel: firstStopResult.nextSectionLabel ?? ""
  };
}