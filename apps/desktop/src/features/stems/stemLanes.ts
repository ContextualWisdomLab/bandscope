import type { RehearsalPriority, RehearsalRole, RehearsalSong } from "@bandscope/shared-types";

/**
 * One isolation lane derived from a role that appears in one or more sections.
 */
export type StemLane = {
  /** Stable role identity used across sections. */
  roleId: string;
  /** Display name the player should lock first. */
  roleName: string;
  /** Arrangement role class: instrument, vocal, or hand. */
  roleType: RehearsalRole["roleType"];
  /** Lowest playable note reported for the role. */
  lowestNote: string;
  /** Highest playable note reported for the role. */
  highestNote: string;
  /** Section labels where this role is present, first-seen order. */
  sectionLabels: string[];
  /** Unique overlap warnings the player should check before rehearsal. */
  overlapWarnings: string[];
  /** Highest rehearsal priority observed for the role. */
  rehearsalPriority: RehearsalPriority;
};

const PRIORITY_RANK: Record<RehearsalPriority, number> = {
  low: 0,
  medium: 1,
  high: 2
};

/**
 * Return the higher of two rehearsal priorities so a role stays marked urgent
 * if any section still needs attention.
 */
export function higherRehearsalPriority(
  left: RehearsalPriority,
  right: RehearsalPriority
): RehearsalPriority {
  return PRIORITY_RANK[left] >= PRIORITY_RANK[right] ? left : right;
}

/**
 * Append a unique non-blank label while preserving first-seen order.
 */
function pushUniqueLabel(labels: string[], value: string): void {
  const trimmed = value.trim();
  if (!trimmed || labels.includes(trimmed)) {
    return;
  }
  labels.push(trimmed);
}

/**
 * Build display-unique stem lanes from the song's section-role hierarchy.
 *
 * Lanes are rehearsal isolation targets, not proof that a local stem file
 * exists. Callers must keep playback copy honest until a stem audio contract
 * is attached.
 */
export function collectStemLanes(song: RehearsalSong): StemLane[] {
  const lanes = new Map<string, StemLane>();

  for (const section of song.sections) {
    for (const role of section.roles) {
      const existing = lanes.get(role.id);
      if (!existing) {
        lanes.set(role.id, {
          roleId: role.id,
          roleName: role.name.trim(),
          roleType: role.roleType,
          lowestNote: role.range.lowestNote,
          highestNote: role.range.highestNote,
          sectionLabels: section.label.trim() ? [section.label] : [],
          overlapWarnings: [...new Set(role.overlapWarnings.map((warning) => warning.trim()).filter(Boolean))],
          rehearsalPriority: role.rehearsalPriority
        });
        continue;
      }

      if (!existing.roleName && role.name.trim()) {
        existing.roleName = role.name.trim();
      }
      existing.rehearsalPriority = higherRehearsalPriority(
        existing.rehearsalPriority,
        role.rehearsalPriority
      );
      pushUniqueLabel(existing.sectionLabels, section.label);
      for (const warning of role.overlapWarnings) {
        pushUniqueLabel(existing.overlapWarnings, warning);
      }
    }
  }

  return [...lanes.values()].map((lane) => ({
    ...lane,
    roleName: lane.roleName || lane.roleId
  }));
}
