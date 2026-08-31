import type { RehearsalSong } from "@bandscope/shared-types";
import type { TranslationKey } from "../../i18n";
import type { CueSheetLeadRow } from "../../lib/export";
import { fillRangeCopy, firstRangeSqueezeTarget, meaningfulRangeText } from "./firstRangeSqueeze";

/** Documented. */
type Translator = (key: TranslationKey) => string;

/** Documented. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Preserve literal source-row text while trimming surrounding whitespace. */
function runtimeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolve a role filter against the song currently being exported.
 *
 * Workspace can replace its song without unmounting, so React state may still
 * contain a role id from the previous project for one render. A well-formed
 * current song that no longer contains that id means "no current filter";
 * malformed role evidence remains a fail-closed condition instead of silently
 * broadening the export.
 */
function currentSongRoleFilter(
  songValue: unknown,
  activeRole: string | null
): string | null | undefined {
  if (!activeRole) {
    return null;
  }
  if (!isRuntimeObject(songValue) || !Array.isArray(songValue.sections)) {
    return undefined;
  }

  for (const sectionValue of songValue.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      return undefined;
    }
    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue) || !Object.prototype.hasOwnProperty.call(roleValue, "id")) {
        return undefined;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      if (!roleId) {
        return undefined;
      }
      if (roleId === activeRole) {
        return activeRole;
      }
    }
  }

  return null;
}

/**
 * Build the cue-sheet lead row for tonight's first playable-range action.
 *
 * Retains the exact section/role target chosen by the range selector instead
 * of rematching display labels, so repeated form labels cannot attach an
 * earlier section's groove, harmony, cue, or priority to a later clash.
 */
export function firstCueSheetLead(
  song: RehearsalSong,
  activeRole: string | null,
  t: Translator
): CueSheetLeadRow | null {
  const runtimeSong: unknown = song;
  const currentActiveRole = currentSongRoleFilter(runtimeSong, activeRole);
  if (currentActiveRole === undefined) {
    return null;
  }

  const target = firstRangeSqueezeTarget(song, currentActiveRole);
  if (!target) {
    return null;
  }
  const { squeeze } = target;

  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const sectionValue = runtimeSong.sections[target.sectionIndex];
  if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
    return null;
  }
  if (meaningfulRangeText(sectionValue.label) !== squeeze.sectionLabel) {
    return null;
  }
  if (target.sectionId && meaningfulRangeText(sectionValue.id) !== target.sectionId) {
    return null;
  }

  const roleValue = sectionValue.roles[target.roleIndex];
  if (!isRuntimeObject(roleValue) || !isRuntimeObject(roleValue.range)) {
    return null;
  }
  if (meaningfulRangeText(roleValue.id) !== target.roleId) {
    return null;
  }
  if (currentActiveRole && target.roleId !== currentActiveRole) {
    return null;
  }
  if (meaningfulRangeText(roleValue.name) !== squeeze.roleName) {
    return null;
  }
  if (
    meaningfulRangeText(roleValue.range.lowestNote) !== squeeze.lowestNote
    || meaningfulRangeText(roleValue.range.highestNote) !== squeeze.highestNote
  ) {
    return null;
  }

  const harmony = isRuntimeObject(roleValue.harmony) ? runtimeText(roleValue.harmony.chord) : "";
  const cue = isRuntimeObject(roleValue.cue) ? runtimeText(roleValue.cue.value) : "";

  return {
    section: t("workspaceCueSheetFirstActionSection"),
    groove: runtimeText(sectionValue.groove),
    role: squeeze.roleName,
    harmony,
    cue,
    priority: runtimeText(roleValue.rehearsalPriority),
    notes: fillRangeCopy(
      t(squeeze.overlapWarning ? "workspaceFirstRangeClash" : "workspaceFirstRangeCheck"),
      {
        roleName: squeeze.roleName,
        lowestNote: squeeze.lowestNote,
        highestNote: squeeze.highestNote,
        sectionLabel: squeeze.sectionLabel
      }
    )
  };
}
