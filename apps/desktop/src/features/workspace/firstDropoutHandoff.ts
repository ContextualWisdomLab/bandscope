import type { RehearsalRole, RehearsalSection, RehearsalSong } from "@bandscope/shared-types";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Tonight's first dropout: earliest section handoff, then the highest-priority outgoing part. */
export type FirstDropoutHandoff = {
  section: RehearsalSection;
  fromRole: RehearsalRole;
  toRole: RehearsalRole;
  endSeconds: number;
};

/** Format a non-negative dropout time as m:ss for rehearsal copy. */
export function formatDropoutTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds >= 0 ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Return true when the role carries a ranked rehearsal priority. */
function hasRankedPriority(role: RehearsalRole): boolean {
  return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, role.rehearsalPriority);
}

/** Return the first validated section-local dropout, or null when no safe candidate remains. */
export function resolveFirstDropoutHandoff(song: RehearsalSong): FirstDropoutHandoff | null {
  const sections = song.sections
    .filter(
      (section) =>
        Number.isFinite(section.timeRange.start) &&
        section.timeRange.start >= 0 &&
        Number.isFinite(section.timeRange.end) &&
        section.timeRange.end >= section.timeRange.start
    )
    .sort((left, right) => left.timeRange.start - right.timeRange.start);

  const candidates: FirstDropoutHandoff[] = [];

  for (const section of sections) {
    const rolesInSection = new Map(section.roles.map((role) => [role.id, role]));

    for (const node of section.partGraph) {
      if (!node.is_active || !Array.isArray(node.handoff_to) || node.handoff_to.length === 0) {
        continue;
      }

      const fromRole = rolesInSection.get(node.role_id);
      if (!fromRole || !hasRankedPriority(fromRole)) {
        continue;
      }

      const targets = node.handoff_to
        .filter((roleId): roleId is string => typeof roleId === "string" && roleId.trim().length > 0)
        .map((roleId) => rolesInSection.get(roleId) ?? null)
        .filter(
          (role): role is RehearsalRole =>
            role !== null && hasRankedPriority(role) && role.id !== fromRole.id
        );

      if (targets.length === 0) {
        continue;
      }

      const toRole = [...targets].sort(
        (left, right) => PRIORITY_RANK[left.rehearsalPriority] - PRIORITY_RANK[right.rehearsalPriority]
      )[0];
      if (!toRole) {
        continue;
      }

      candidates.push({
        section,
        fromRole,
        toRole,
        endSeconds: section.timeRange.end
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (left.endSeconds !== right.endSeconds) {
      return left.endSeconds - right.endSeconds;
    }
    return PRIORITY_RANK[left.fromRole.rehearsalPriority] - PRIORITY_RANK[right.fromRole.rehearsalPriority];
  });

  return candidates[0] ?? null;
}
