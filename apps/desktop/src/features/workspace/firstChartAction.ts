import type { RehearsalSong } from "@bandscope/shared-types";
import type { TranslationKey } from "../../i18n";
import type { ChartFirstAction } from "../../lib/export";
import { fillRangeCopy, firstRangeSqueeze } from "./firstRangeSqueeze";

/** Documented. */
type Translator = (key: TranslationKey) => string;

/**
 * Build tonight's first-action lead for the rehearsal chart JSON.
 *
 * Uses the same playable-span authority as the ready map. Values stay
 * literal so JSON encoding, not this helper, is the serialization boundary.
 * Malformed songs and unnamed spans fail closed instead of inventing a lead.
 */
export function firstChartAction(
  song: RehearsalSong,
  activeRole: string | null,
  t: Translator
): ChartFirstAction | null {
  const squeeze = firstRangeSqueeze(song, activeRole);
  if (!squeeze) {
    return null;
  }

  return {
    section: squeeze.sectionLabel,
    role: squeeze.roleName,
    lowestNote: squeeze.lowestNote,
    highestNote: squeeze.highestNote,
    next: fillRangeCopy(
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
