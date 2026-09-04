import { SECTION_FORM_LABELS, type CueAnchorKind, type RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Admitted lyric, count, or transition entrance for a selected part. */
export type AdmittedCueKind = CueAnchorKind;

/** Tonight's first trusted entrance cue for a selected named part. */
export type FirstEntranceCue =
  | {
      status: "ready";
      kind: AdmittedCueKind;
      value: string;
      sectionLabel: string;
      roleName: string;
    }
  | { status: "unavailable" };

type SelectedRoleCopy = {
  sectionLabel: string;
  roleName: string;
  cue: { kind: AdmittedCueKind; value: string } | null;
};

const ADMITTED_CUE_KINDS = new Set<AdmittedCueKind>(["lyric", "count", "transition"]);
const CANONICAL_SECTION_LABELS = new Set<string>(SECTION_FORM_LABELS);

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether a record owns a field rather than inheriting it. */
function owns(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

/** Return whether a cue kind is one of the three rehearsal entrance kinds. */
export function isAdmittedCueKind(value: unknown): value is AdmittedCueKind {
  return typeof value === "string" && ADMITTED_CUE_KINDS.has(value as AdmittedCueKind);
}

/** Admit one own-property cue without granting inherited members authority. */
function admitEntranceCue(
  roleValue: Record<string, unknown>
): { kind: AdmittedCueKind; value: string } | null {
  if (!owns(roleValue, "cue") || !isRuntimeObject(roleValue.cue)) {
    return null;
  }

  const cueValue = roleValue.cue;
  if (!owns(cueValue, "kind") || !owns(cueValue, "value") || !isAdmittedCueKind(cueValue.kind)) {
    return null;
  }

  const value = meaningfulRangeText(cueValue.value);
  if (!value) {
    return null;
  }

  return { kind: cueValue.kind, value };
}

/**
 * Name the selected part's first trusted entrance cue.
 *
 * Lyric, count, and transition cues are the rehearsal entrance the player
 * should catch before that part comes in. This is selected-part guidance, not
 * the song-wide first-lyric, first-count, or first-transition map products,
 * and it is not Active Player or MIR work. Inherited cue fields, unknown
 * kinds, blank or `none` values, unnamed roles, duplicate ids in one section,
 * conflicting display names, and non-canonical section labels fail closed
 * instead of becoming entrance authority.
 */
export function firstEntranceCue(
  song: RehearsalSong | unknown,
  activeRole: string | null
): FirstEntranceCue {
  const selectedRoleId = meaningfulRangeText(activeRole);
  if (!selectedRoleId || !isRuntimeObject(song) || !owns(song, "sections") || !Array.isArray(song.sections)) {
    return { status: "unavailable" };
  }

  const copies: SelectedRoleCopy[] = [];
  let knownName: string | undefined;

  for (const sectionValue of song.sections) {
    if (
      !isRuntimeObject(sectionValue) ||
      !owns(sectionValue, "label") ||
      !owns(sectionValue, "roles") ||
      !Array.isArray(sectionValue.roles)
    ) {
      return { status: "unavailable" };
    }

    const rawLabel = meaningfulRangeText(sectionValue.label);
    if (!rawLabel) {
      return { status: "unavailable" };
    }

    const sectionRoleIds = new Set<string>();
    let selectedCopy: Record<string, unknown> | null = null;

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue) || !owns(roleValue, "id") || !owns(roleValue, "name")) {
        return { status: "unavailable" };
      }

      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = meaningfulRangeText(roleValue.name);
      if (!roleId || !roleName) {
        return { status: "unavailable" };
      }
      if (sectionRoleIds.has(roleId)) {
        return { status: "unavailable" };
      }
      sectionRoleIds.add(roleId);

      if (roleId !== selectedRoleId) {
        continue;
      }
      if (selectedCopy) {
        return { status: "unavailable" };
      }
      selectedCopy = roleValue;
    }

    if (!selectedCopy) {
      continue;
    }

    const roleName = meaningfulRangeText(selectedCopy.name);
    if (!roleName) {
      return { status: "unavailable" };
    }
    if (knownName && knownName !== roleName) {
      return { status: "unavailable" };
    }
    knownName = roleName;

    if (!CANONICAL_SECTION_LABELS.has(rawLabel)) {
      continue;
    }

    copies.push({
      sectionLabel: rawLabel,
      roleName,
      cue: admitEntranceCue(selectedCopy)
    });
  }

  for (const copy of copies) {
    if (!copy.cue) {
      return { status: "unavailable" };
    }
    return {
      status: "ready",
      kind: copy.cue.kind,
      value: copy.cue.value,
      sectionLabel: copy.sectionLabel,
      roleName: copy.roleName
    };
  }

  return { status: "unavailable" };
}

/** Fill trusted `{token}` placeholders for entrance-cue copy. */
export function fillEntranceCueCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}
