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

const NATURAL_PITCH_CLASS = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
} as const;

const ACCIDENTAL_OFFSET: Record<string, number> = {
  "": 0,
  "#": 1,
  "♯": 1,
  b: -1,
  "♭": -1
};

const NOTE_PATTERN = /^([A-Ga-g])([#b♯♭]?)(-?\d{1,2})$/u;

/**
 * Convert a bounded scientific-pitch label into a chromatic ordering value.
 *
 * `null` keeps malformed or non-note evidence from widening a display range.
 */
function notePitchValue(note: string): number | null {
  const match = NOTE_PATTERN.exec(note.trim());
  if (!match) {
    return null;
  }
  const letter = match[1].toUpperCase() as keyof typeof NATURAL_PITCH_CLASS;
  const octave = Number(match[3]);
  return (octave + 1) * 12 + NATURAL_PITCH_CLASS[letter] + ACCIDENTAL_OFFSET[match[2]];
}

/**
 * Choose the more extreme valid note while retaining the first label on ties.
 */
function widerRangeBoundary(
  current: string,
  candidate: string,
  isMoreExtreme: (candidatePitch: number, currentPitch: number) => boolean
): string {
  const candidatePitch = notePitchValue(candidate);
  if (candidatePitch === null) {
    return current;
  }
  const currentPitch = notePitchValue(current);
  if (currentPitch === null || isMoreExtreme(candidatePitch, currentPitch)) {
    return candidate.trim();
  }
  return current;
}

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
 * is attached. When one role spans sections, its lane widens to the lowest and
 * highest valid pitch reported anywhere in those sections.
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
          sectionLabels: [section.label],
          overlapWarnings: [...new Set(role.overlapWarnings.map((warning) => warning.trim()).filter(Boolean))],
          rehearsalPriority: role.rehearsalPriority
        });
        continue;
      }

      if (!existing.roleName && role.name.trim()) {
        existing.roleName = role.name.trim();
      }
      existing.lowestNote = widerRangeBoundary(
        existing.lowestNote,
        role.range.lowestNote,
        (candidatePitch, currentPitch) => candidatePitch < currentPitch
      );
      existing.highestNote = widerRangeBoundary(
        existing.highestNote,
        role.range.highestNote,
        (candidatePitch, currentPitch) => candidatePitch > currentPitch
      );
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
