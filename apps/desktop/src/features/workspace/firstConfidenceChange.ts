import type { ConfidenceLevel, RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named section-confidence change, or a same-level hold through the form. */
export type FirstConfidenceChange = {
  kind: "change" | "same";
  fromSectionId: string;
  fromSectionLabel: string;
  fromLevel: ConfidenceLevel;
  toSectionId: string;
  toSectionLabel: string;
  toLevel: ConfidenceLevel;
};

type NamedConfidence = {
  sectionId: string;
  sectionLabel: string;
  level: ConfidenceLevel;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return a named rehearsal confidence level or fail closed. */
export function sectionConfidenceLevel(confidenceValue: unknown): ConfidenceLevel | null {
  if (!isRuntimeObject(confidenceValue)) {
    return null;
  }
  const level = confidenceValue.level;
  if (level === "low" || level === "medium" || level === "high") {
    return level;
  }
  return null;
}

/**
 * Pick the first named section-confidence change a player should confirm by ear.
 *
 * Walks labeled sections in form order and returns the first consecutive pair
 * whose confidence level differs. When every named section holds the same
 * level, the result is a same-level hold so the room does not invent a reset.
 * Stable section ids, rather than display labels, own roadmap targeting.
 * All meaningful section ids are validated for uniqueness before confidence
 * evidence is derived so an ineligible or later duplicate cannot create
 * ambiguous cards.
 */
export function firstConfidenceChange(song: RehearsalSong): FirstConfidenceChange | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const seenSectionIds = new Set<string>();
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    if (!sectionId) {
      continue;
    }
    if (seenSectionIds.has(sectionId)) {
      return null;
    }
    seenSectionIds.add(sectionId);
  }

  const namedLevels: NamedConfidence[] = [];
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    const level = sectionConfidenceLevel(sectionValue.confidence);
    if (!sectionId || !sectionLabel || level === null) {
      continue;
    }
    namedLevels.push({
      sectionId,
      sectionLabel,
      level
    });
  }

  if (namedLevels.length === 0) {
    return null;
  }

  const first = namedLevels[0];
  if (!first) {
    return null;
  }
  for (let index = 1; index < namedLevels.length; index += 1) {
    const previous = namedLevels[index - 1];
    const current = namedLevels[index];
    if (previous.level !== current.level) {
      return {
        kind: "change",
        fromSectionId: previous.sectionId,
        fromSectionLabel: previous.sectionLabel,
        fromLevel: previous.level,
        toSectionId: current.sectionId,
        toSectionLabel: current.sectionLabel,
        toLevel: current.level
      };
    }
  }

  return {
    kind: "same",
    fromSectionId: first.sectionId,
    fromSectionLabel: first.sectionLabel,
    fromLevel: first.level,
    toSectionId: first.sectionId,
    toSectionLabel: first.sectionLabel,
    toLevel: first.level
  };
}

/** Fill trusted `{token}` placeholders for confidence-change rehearsal copy. */
export function fillConfidenceCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}

/** True when this stable section identity is the map card owning the next confidence action. */
export function isConfidenceChangeTarget(change: FirstConfidenceChange, sectionId: string): boolean {
  const identity = meaningfulRangeText(sectionId);
  return Boolean(identity) && identity === change.toSectionId;
}

/** Map a validated confidence level onto the matching i18n word key. */
export function confidenceWordKey(level: ConfidenceLevel): "confidenceWordLow" | "confidenceWordMedium" | "confidenceWordHigh" {
  if (level === "low") {
    return "confidenceWordLow";
  }
  if (level === "high") {
    return "confidenceWordHigh";
  }
  return "confidenceWordMedium";
}

