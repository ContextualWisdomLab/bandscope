import type { RehearsalSong } from "@bandscope/shared-types";
import type { TranslationKey } from "../../i18n";
import type { CueSheetLeadRow } from "../../lib/export";
import { fillRangeCopy, firstRangeSqueeze, meaningfulRangeText } from "./firstRangeSqueeze";

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
 * Fail closed when the squeeze cannot be matched to a concrete role on the
 * untrusted song payload, so the export never invents a first action.
 */
export function firstCueSheetLead(
  song: RehearsalSong,
  activeRole: string | null,
  t: Translator
): CueSheetLeadRow | null {
  const squeeze = firstRangeSqueeze(song, activeRole);
  if (!squeeze) {
    return null;
  }

  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    if (meaningfulRangeText(sectionValue.label) !== squeeze.sectionLabel) {
      continue;
    }

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue) || !isRuntimeObject(roleValue.range)) {
        continue;
      }
      if (activeRole && meaningfulRangeText(roleValue.id) !== activeRole) {
        continue;
      }
      if (meaningfulRangeText(roleValue.name) !== squeeze.roleName) {
        continue;
      }
      if (
        meaningfulRangeText(roleValue.range.lowestNote) !== squeeze.lowestNote
        || meaningfulRangeText(roleValue.range.highestNote) !== squeeze.highestNote
      ) {
        continue;
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
  }

  return null;
}
