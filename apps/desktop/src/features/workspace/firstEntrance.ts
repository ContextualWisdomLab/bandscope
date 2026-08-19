import { SECTION_FORM_LABELS, type RehearsalRole, type RehearsalSection, type RehearsalSong } from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

type EntranceRole = Pick<RehearsalRole, "id" | "name" | "cue" | "rehearsalPriority">;
type EntranceSection = Pick<RehearsalSection, "id" | "label" | "timeRange"> & {
  roles: unknown[];
  partGraph: unknown[];
};

/** Return whether a runtime value is a non-null record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Return whether a runtime role has the fields required by entrance guidance. */
function isEntranceRole(value: unknown): value is EntranceRole {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    isRecord(value.cue) &&
    typeof value.cue.value === "string" &&
    typeof value.rehearsalPriority === "string" &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, value.rehearsalPriority)
  );
}

/** Return whether a runtime graph node proves an active role. */
function isActivePartGraphNode(value: unknown): value is { role_id: string; is_active: true } {
  return (
    isRecord(value) &&
    value.is_active === true &&
    typeof value.role_id === "string" &&
    value.role_id.trim().length > 0
  );
}

/** Return whether a runtime section has the fields required by entrance guidance. */
function isEntranceSection(value: unknown): value is EntranceSection {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.trim().length === 0) {
    return false;
  }
  if (!SECTION_FORM_LABELS.includes(value.label as (typeof SECTION_FORM_LABELS)[number])) {
    return false;
  }
  if (!isRecord(value.timeRange)) {
    return false;
  }
  if (
    typeof value.timeRange.start !== "number" ||
    !Number.isFinite(value.timeRange.start) ||
    value.timeRange.start < 0 ||
    typeof value.timeRange.end !== "number" ||
    !Number.isFinite(value.timeRange.end) ||
    value.timeRange.end <= value.timeRange.start
  ) {
    return false;
  }
  return Array.isArray(value.roles) && Array.isArray(value.partGraph);
}

/** Tonight's first entrance: earliest section, then the highest-priority active role in that section. */
export type FirstEntrance = {
  section: EntranceSection;
  role: EntranceRole;
  startSeconds: number;
};

/** Format a non-negative section start as m:ss for rehearsal copy. */
export function formatEntranceTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Return the first validated section/role the room should hear, or null when no safe candidate remains. */
export function resolveFirstEntrance(song: RehearsalSong): FirstEntrance | null {
  if (!song || !Array.isArray(song.sections)) {
    return null;
  }

  const candidate = song.sections
    .filter(isEntranceSection)
    .map((section) => {
      const activeRoleIds = new Set(
        section.partGraph.filter(isActivePartGraphNode).map((node) => node.role_id)
      );
      return {
        section,
        roles: section.roles.filter((role) => isEntranceRole(role) && activeRoleIds.has(role.id))
      };
    })
    .filter(({ roles }) => roles.length > 0)
    .sort((left, right) => left.section.timeRange.start - right.section.timeRange.start)[0];
  if (!candidate) {
    return null;
  }

  const role = [...candidate.roles].sort(
    (left, right) => PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority]
  )[0]!;

  return {
    section: candidate.section,
    role,
    startSeconds: candidate.section.timeRange.start
  };
}
