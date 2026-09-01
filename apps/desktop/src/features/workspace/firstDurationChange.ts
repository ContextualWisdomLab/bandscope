import { MAX_SECTION_TIME_SECONDS, type RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named section-length change, or a same-length hold through the form. */
export type FirstDurationChange = {
  kind: "change" | "same";
  fromSectionId: string;
  fromSectionLabel: string;
  fromDuration: string;
  toSectionId: string;
  toSectionLabel: string;
  toDuration: string;
};

type NamedDuration = {
  sectionId: string;
  sectionLabel: string;
  duration: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Return a positive integer duration in seconds from untrusted time-range evidence.
 *
 * Mirrors the shared rehearsal-song contract: start and end must be finite
 * integers, start must be in range, and end must be strictly after start.
 */
export function sectionDurationSeconds(timeRangeValue: unknown): number | null {
  if (!isRuntimeObject(timeRangeValue)) {
    return null;
  }
  const start = timeRangeValue.start;
  const end = timeRangeValue.end;
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > MAX_SECTION_TIME_SECONDS ||
    end <= start ||
    end > MAX_SECTION_TIME_SECONDS
  ) {
    return null;
  }
  return end - start;
}

/**
 * Pick the first named section-length change a player should count in before the next section.
 *
 * Walks labeled sections in form order and returns the first consecutive pair
 * whose integer duration differs. When every named section holds the same
 * length, the result is a same-length hold so the room does not reset the
 * count. Stable section ids, rather than display labels, own roadmap targeting.
 * All meaningful section ids are validated for uniqueness before duration
 * evidence is derived so an ineligible or later duplicate cannot create
 * ambiguous cards.
 */
export function firstDurationChange(song: RehearsalSong): FirstDurationChange | null {
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

  const namedDurations: NamedDuration[] = [];
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    const durationSeconds = sectionDurationSeconds(sectionValue.timeRange);
    if (!sectionId || !sectionLabel || durationSeconds === null) {
      continue;
    }
    namedDurations.push({
      sectionId,
      sectionLabel,
      duration: String(durationSeconds)
    });
  }

  if (namedDurations.length === 0) {
    return null;
  }

  const first = namedDurations[0];
  if (!first) {
    return null;
  }
  for (let index = 1; index < namedDurations.length; index += 1) {
    const previous = namedDurations[index - 1];
    const current = namedDurations[index];
    if (previous.duration !== current.duration) {
      return {
        kind: "change",
        fromSectionId: previous.sectionId,
        fromSectionLabel: previous.sectionLabel,
        fromDuration: previous.duration,
        toSectionId: current.sectionId,
        toSectionLabel: current.sectionLabel,
        toDuration: current.duration
      };
    }
  }

  return {
    kind: "same",
    fromSectionId: first.sectionId,
    fromSectionLabel: first.sectionLabel,
    fromDuration: first.duration,
    toSectionId: first.sectionId,
    toSectionLabel: first.sectionLabel,
    toDuration: first.duration
  };
}

/** Fill trusted `{token}` placeholders for duration-change rehearsal copy. */
export function fillDurationCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}

/** True when this stable section identity is the map card owning the next duration action. */
export function isDurationChangeTarget(change: FirstDurationChange, sectionId: string): boolean {
  const identity = meaningfulRangeText(sectionId);
  return Boolean(identity) && identity === change.toSectionId;
}
