import {
  MAX_SECTION_TIME_SECONDS,
  type RehearsalRole,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const SECTION_FORM_LABELS = new Set<RehearsalSection["label"]>([
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "outro",
  "tag",
  "pickup",
  "stop",
  "handoff"
]);

/** Tonight's first stop: the earliest labeled cut, its holder, and adjacent form context. */
export type FirstStopHandoff = {
  section: RehearsalSection;
  holdingRole: RehearsalRole | null;
  atSeconds: number;
  previousSectionLabel: RehearsalSection["label"] | null;
  nextSectionLabel: RehearsalSection["label"] | null;
};

/** Format a non-negative stop time as m:ss for rehearsal copy. */
export function formatStopTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Return whether an untrusted runtime value can be inspected as an object. */
function isRuntimeObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

/** Return true when the role has safe runtime identity/copy and ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return (
    typeof role.id === "string" &&
    role.id.trim().length > 0 &&
    typeof role.name === "string" &&
    role.name.trim().length > 0 &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority)
  );
}

/** Return whether a section has a bounded, positive-length integer rehearsal window. */
function hasBoundedTimeRange(section: RehearsalSection): boolean {
  const timeRange = section.timeRange as Partial<RehearsalSection["timeRange"]> | null;
  if (timeRange === null || typeof timeRange !== "object") {
    return false;
  }

  const start = timeRange.start ?? -1;
  const end = timeRange.end ?? -1;
  return (
    Number.isInteger(start) &&
    start >= 0 &&
    start <= MAX_SECTION_TIME_SECONDS &&
    Number.isInteger(end) &&
    end > start &&
    end <= MAX_SECTION_TIME_SECONDS
  );
}

/** Return safe identities that appear more than once in one section-local collection. */
function repeatedIds(ids: string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      repeated.add(id);
    } else {
      seen.add(id);
    }
  }
  return repeated;
}

/** Prefer the highest-priority ranked role, then a stable id order. */
function pickHighestPriorityRole(roles: RehearsalRole[]): RehearsalRole | null {
  if (roles.length === 0) {
    return null;
  }
  return (
    [...roles].sort((left, right) => {
      const rankDelta = PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority];
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return left.id.localeCompare(right.id);
    })[0] ?? null
  );
}

/** Return ranked roles whose unique graph node is explicitly active. */
function rankedActiveRoles(section: RehearsalSection): RehearsalRole[] {
  if (!Array.isArray(section.roles) || !Array.isArray(section.partGraph)) {
    return [];
  }

  const safeRoleIds = section.roles
    .filter(
      (role) => isRuntimeObject(role) && typeof role.id === "string" && role.id.trim().length > 0
    )
    .map((role) => role.id);
  const safeGraphRoleIds = section.partGraph
    .filter(
      (node) => isRuntimeObject(node) && typeof node.role_id === "string" && node.role_id.trim().length > 0
    )
    .map((node) => node.role_id);
  const repeatedRoleIds = repeatedIds(safeRoleIds);
  const repeatedGraphRoleIds = repeatedIds(safeGraphRoleIds);
  const activeIds = new Set(
    section.partGraph
      .filter(
        (node) =>
          isRuntimeObject(node) &&
          node.is_active === true &&
          typeof node.role_id === "string" &&
          node.role_id.trim().length > 0 &&
          !repeatedGraphRoleIds.has(node.role_id)
      )
      .map((node) => node.role_id)
  );

  return section.roles.filter(
    (role) =>
      isRuntimeObject(role) &&
      hasRankedPriority(role) &&
      !repeatedRoleIds.has(role.id) &&
      activeIds.has(role.id)
  );
}

/** Validate section identities once so a duplicate cannot redirect a map action. */
function uniqueRuntimeSections(song: RehearsalSong): RehearsalSection[] | null {
  const sections: RehearsalSection[] = [];
  const seenSectionIds = new Set<string>();
  for (const sectionValue of song.sections as unknown[]) {
    if (!isRuntimeObject(sectionValue)) {
      return null;
    }
    const section = sectionValue as RehearsalSection;
    if (typeof section.id !== "string" || section.id.trim().length === 0) {
      return null;
    }
    const sectionId = section.id.trim();
    if (seenSectionIds.has(sectionId)) {
      return null;
    }
    seenSectionIds.add(sectionId);
    sections.push(section);
  }
  return sections;
}

/** Return a supported buyer-safe form label or null rather than echoing malformed runtime data. */
function safeSectionLabel(section: RehearsalSection | undefined): RehearsalSection["label"] | null {
  if (!section) {
    return null;
  }
  const label: unknown = section.label;
  if (typeof label !== "string" || !SECTION_FORM_LABELS.has(label as RehearsalSection["label"])) {
    return null;
  }
  return label as RehearsalSection["label"];
}

/** Return the first labeled stop, or null when no safe cut remains. */
export function resolveFirstStopHandoff(song: RehearsalSong): FirstStopHandoff | null {
  if (!isRuntimeObject(song) || !Array.isArray(song.sections)) {
    return null;
  }

  const uniqueSections = uniqueRuntimeSections(song);
  if (!uniqueSections) {
    return null;
  }

  const timelineSections = uniqueSections
    .filter((section) => hasBoundedTimeRange(section))
    .sort((left, right) => {
      if (left.timeRange.start !== right.timeRange.start) {
        return left.timeRange.start - right.timeRange.start;
      }
      return left.id.localeCompare(right.id);
    });
  const stopIndex = timelineSections.findIndex((section) => section.label === "stop");
  if (stopIndex < 0) {
    return null;
  }

  const section = timelineSections[stopIndex];
  if (!section) {
    return null;
  }

  return {
    section,
    holdingRole: pickHighestPriorityRole(rankedActiveRoles(section)),
    atSeconds: section.timeRange.start,
    previousSectionLabel: safeSectionLabel(timelineSections[stopIndex - 1]),
    nextSectionLabel: safeSectionLabel(timelineSections[stopIndex + 1])
  };
}
