import {
  SECTION_FORM_LABELS,
  type MetadataHandoffFirstAction,
  type RehearsalSong,
  type SectionFormLabel
} from "@bandscope/shared-types";
import { meaningfulRangeText, playableRange } from "./firstRangeSqueeze";

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return whether a runtime label is a contracted section form. */
function isSectionFormLabel(value: string): value is SectionFormLabel {
  return (SECTION_FORM_LABELS as readonly string[]).includes(value);
}

/**
 * Build tonight's first playable-range action for a full-band metadata handoff.
 *
 * Uses the same span authority as the ready map. Values stay literal so the
 * handoff encoder, not this helper, is the serialization boundary. Malformed
 * songs and unnamed spans fail closed instead of inventing a lead. Transient
 * workspace role filters must not change a shared artifact's first action.
 */
export function firstHandoffAction(song: RehearsalSong): MetadataHandoffFirstAction | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  let fallback: MetadataHandoffFirstAction | null = null;

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue) || !Array.isArray(sectionValue.roles)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    if (!sectionId || !sectionLabel || !isSectionFormLabel(sectionLabel)) {
      continue;
    }

    for (const roleValue of sectionValue.roles) {
      if (!isRuntimeObject(roleValue)) {
        continue;
      }
      const roleId = meaningfulRangeText(roleValue.id);
      const roleName = roleValue.name;
      if (!roleId || typeof roleName !== "string" || !meaningfulRangeText(roleName)) {
        continue;
      }
      if (!isRuntimeObject(roleValue.range)) {
        continue;
      }

      const range = playableRange(roleValue.range.lowestNote, roleValue.range.highestNote);
      if (!range) {
        continue;
      }

      let clash = false;
      if (Array.isArray(roleValue.overlapWarnings)) {
        for (const warning of roleValue.overlapWarnings) {
          if (meaningfulRangeText(warning)) {
            clash = true;
            break;
          }
        }
      }

      const candidate: MetadataHandoffFirstAction = {
        sectionId,
        sectionLabel,
        roleId,
        roleName,
        lowestNote: range.lowestNote,
        highestNote: range.highestNote,
        clash
      };

      if (clash) {
        return candidate;
      }

      if (!fallback) {
        fallback = candidate;
      }
    }
  }

  return fallback;
}
