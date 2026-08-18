import type { RehearsalRole, RehearsalSection, RehearsalSong } from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tonight's first lyric cue: earliest section with a lyric, then the highest-priority lyric role. */
export type FirstLyricCue = {
  section: RehearsalSection;
  role: RehearsalRole;
  startSeconds: number;
  lyric: string;
};

/** Format a non-negative section start as m:ss for rehearsal copy. */
export function formatLyricCueTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Return a trimmed lyric cue only when the role carries non-blank lyric evidence. */
function lyricText(role: RehearsalRole): string | null {
  if (role.cue.kind !== "lyric" || typeof role.cue.value !== "string") {
    return null;
  }
  const lyric = role.cue.value.trim();
  return lyric ? lyric : null;
}

/** Return the first validated lyric the room should hear, or null when no safe candidate remains. */
export function resolveFirstLyricCue(song: RehearsalSong): FirstLyricCue | null {
  const sections = song.sections
    .filter((section) => Number.isFinite(section.timeRange.start) && section.timeRange.start >= 0)
    .sort((left, right) => left.timeRange.start - right.timeRange.start);

  for (const section of sections) {
    const lyricRoles = section.roles.filter(
      (role) =>
        Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority) &&
        lyricText(role) !== null
    );
    if (lyricRoles.length === 0) {
      continue;
    }

    const role = [...lyricRoles].sort(
      (left, right) => PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority]
    )[0];
    if (!role) {
      continue;
    }

    const lyric = lyricText(role);
    if (!lyric) {
      continue;
    }

    return {
      section,
      role,
      startSeconds: section.timeRange.start,
      lyric
    };
  }

  return null;
}