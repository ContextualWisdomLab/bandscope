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

/** Documented. */
function runtimeText(value: unknown): string {
  return meaningfulRangeText(value) ?? "";
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
  const target = firstRangeSqueezeTarget(song, activeRole);
  if (!target) {
    return null;
  }
  const { squeeze } = target;

  const runtimeSong: unknown = song;
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
  if (activeRole && target.roleId !== activeRole) {
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
