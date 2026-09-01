import { parseRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";

const SYNTHETIC_SECTION_TIME_RANGE = Symbol("bandscope.syntheticSectionTimeRange");

type RuntimeSectionRecord = Record<PropertyKey, unknown> & {
  [SYNTHETIC_SECTION_TIME_RANGE]?: true;
};

/** Return whether an untrusted value can carry section timing evidence. */
function isRuntimeSectionRecord(sectionValue: unknown): sectionValue is RuntimeSectionRecord {
  return typeof sectionValue === "object" && sectionValue !== null && !Array.isArray(sectionValue);
}

/** Return whether a parsed section carries a compatibility-only synthetic time range. */
export function hasSyntheticSectionTimeRange(sectionValue: unknown): boolean {
  return isRuntimeSectionRecord(sectionValue) && sectionValue[SYNTHETIC_SECTION_TIME_RANGE] === true;
}

/**
 * Parse a rehearsal song while retaining whether legacy migration synthesized a section time range.
 *
 * The marker is symbol-keyed, so it remains an application-internal adapter concern and is omitted
 * from JSON/vendor contracts. It is enumerable so ordinary object-spread copies preserve the
 * evidence while the song remains in memory.
 */
export function parseRehearsalSongWithTimingEvidence(songValue: unknown): RehearsalSong {
  const sourceSections =
    isRuntimeSectionRecord(songValue) && Array.isArray(songValue.sections) ? songValue.sections : null;
  const parsedSong = parseRehearsalSong(songValue);

  if (!sourceSections) {
    return parsedSong;
  }

  parsedSong.sections.forEach((parsedSection, sectionIndex) => {
    const sourceSection = sourceSections[sectionIndex];
    if (!isRuntimeSectionRecord(sourceSection)) {
      return;
    }
    const missingSourceTimeRange = !Object.prototype.hasOwnProperty.call(sourceSection, "timeRange");
    if (!missingSourceTimeRange && !hasSyntheticSectionTimeRange(sourceSection)) {
      return;
    }
    Object.defineProperty(parsedSection, SYNTHETIC_SECTION_TIME_RANGE, {
      value: true,
      enumerable: true,
      configurable: false,
      writable: false
    });
  });

  return parsedSong;
}
