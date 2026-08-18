import type { RehearsalRole, RehearsalSection, RehearsalSong } from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tonight's first entrance: earliest section, then the highest-priority role in that section. */
export type FirstEntrance = {
  section: RehearsalSection;
  role: RehearsalRole;
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

/** Return the first section/role the room should hear, or null when the map is empty. */
export function resolveFirstEntrance(song: RehearsalSong): FirstEntrance | null {
  const section = [...song.sections]
    .filter((candidate) => candidate.roles.length > 0)
    .sort((left, right) => left.timeRange.start - right.timeRange.start)[0];
  if (!section) {
    return null;
  }

  const role = [...section.roles].sort(
    (left, right) => PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority]
  )[0];
  if (!role) {
    return null;
  }

  return {
    section,
    role,
    startSeconds: section.timeRange.start
  };
}
