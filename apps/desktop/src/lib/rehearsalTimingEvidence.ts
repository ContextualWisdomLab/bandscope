import {
  parseAnalysisJobStatus,
  parseRehearsalSong,
  type AnalysisJobStatus,
  type RehearsalSong
} from "@bandscope/shared-types";

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

/**
 * Parse an analysis status without losing legacy section-timing provenance in its result.
 *
 * Shared-type legacy normalization is intentionally contract-compatible and can synthesize a
 * missing `timeRange`. Rehearsal decisions must still know that the range was compatibility data,
 * so the desktop adapter compares the normalized result with the untrusted source envelope and
 * reapplies the internal marker before returning it to workspace consumers.
 */
export function parseAnalysisJobStatusWithTimingEvidence(statusValue: unknown): AnalysisJobStatus {
  const parsedStatus = parseAnalysisJobStatus(statusValue);
  if (
    !parsedStatus.result ||
    !isRuntimeSectionRecord(statusValue) ||
    !Object.prototype.hasOwnProperty.call(statusValue, "result")
  ) {
    return parsedStatus;
  }

  parsedStatus.result = parseRehearsalSongWithTimingEvidence(statusValue.result);
  return parsedStatus;
}

/**
 * Fail closed before project persistence can promote compatibility timing to measured evidence.
 *
 * The current project schema has no serializable provenance field for a synthesized section range;
 * serializing the marker would therefore erase the distinction on reload. Until the canonical
 * Project Persistence context owns a versioned migration for that provenance, reanalysis is the
 * only truthful path to a persistable range.
 */
export function assertMeasuredSectionTimingForPersistence(song: RehearsalSong): void {
  if (song.sections.some((section) => hasSyntheticSectionTimeRange(section))) {
    throw new Error("Reanalyze the project to restore measured section timing before saving.");
  }
}
