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
  /** Lowest playable note reported for the role, or blank when untrusted. */
  lowestNote: string;
  /** Highest playable note reported for the role, or blank when untrusted. */
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
 * Return a trimmed scientific-pitch label, or blank when it is malformed.
 */
function normalizedNoteLabel(note: string): string {
  const trimmed = note.trim();
  return notePitchValue(trimmed) === null ? "" : trimmed;
}

/**
 * Normalize one section's range without admitting a contradictory complete pair.
 *
 * Partial valid evidence remains usable so a later section can supply the
 * missing boundary. When both boundaries are valid but the reported lower
 * note is above the upper note, both are discarded together so one bad
 * section cannot widen an otherwise trustworthy aggregate lane.
 */
function normalizedRangeEvidence(
  lowestNote: string,
  highestNote: string
): Pick<StemLane, "lowestNote" | "highestNote"> {
  const normalizedLowest = normalizedNoteLabel(lowestNote);
  const normalizedHighest = normalizedNoteLabel(highestNote);
  const lowestPitch = notePitchValue(normalizedLowest);
  const highestPitch = notePitchValue(normalizedHighest);
  if (lowestPitch !== null && highestPitch !== null && lowestPitch > highestPitch) {
    return { lowestNote: "", highestNote: "" };
  }
  return { lowestNote: normalizedLowest, highestNote: normalizedHighest };
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
 * Clear a complete range when its validated lower boundary is above its upper boundary.
 *
 * Partial ranges stay partial so later sections can still supply the missing
 * boundary. A complete but inverted pair is contradictory evidence and must
 * not be presented under the buyer-facing "Playable range" label.
 */
function failClosedInvertedRange(lane: StemLane): StemLane {
  const lowestPitch = notePitchValue(lane.lowestNote);
  const highestPitch = notePitchValue(lane.highestNote);
  if (lowestPitch === null || highestPitch === null || lowestPitch <= highestPitch) {
    return lane;
  }
  return { ...lane, lowestNote: "", highestNote: "" };
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
 * highest valid pitch reported anywhere in those sections. Malformed initial
 * pitch labels and contradictory complete section ranges are discarded, and a
 * complete aggregate range whose lower boundary is above its upper boundary
 * fails closed rather than being presented as playable.
 */
export function collectStemLanes(song: RehearsalSong): StemLane[] {
  const lanes = new Map<string, StemLane>();

  for (const section of song.sections) {
    for (const role of section.roles) {
      const rangeEvidence = normalizedRangeEvidence(role.range.lowestNote, role.range.highestNote);
      const existing = lanes.get(role.id);
      if (!existing) {
        const sectionLabel = section.label.trim();
        lanes.set(role.id, {
          roleId: role.id,
          roleName: role.name.trim(),
          roleType: role.roleType,
          lowestNote: rangeEvidence.lowestNote,
          highestNote: rangeEvidence.highestNote,
          sectionLabels: sectionLabel ? [sectionLabel] : [],
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
        rangeEvidence.lowestNote,
        (candidatePitch, currentPitch) => candidatePitch < currentPitch
      );
      existing.highestNote = widerRangeBoundary(
        existing.highestNote,
        rangeEvidence.highestNote,
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

  return [...lanes.values()].map((lane) =>
    failClosedInvertedRange({
      ...lane,
      roleName: lane.roleName || lane.roleId
    })
  );
}
