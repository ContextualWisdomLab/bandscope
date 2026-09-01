import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named feel change, or a same-feel hold through the form. */
export type FirstGrooveChange = {
  kind: "change" | "same";
  fromSectionId: string;
  fromSectionLabel: string;
  fromGroove: string;
  toSectionId: string;
  toSectionLabel: string;
  toGroove: string;
};

type NamedGroove = {
  sectionId: string;
  sectionLabel: string;
  groove: string;
};

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Pick the first named groove change a player should count in before the next section.
 *
 * Walks labeled sections in form order and returns the first consecutive pair
 * whose trimmed groove text differs. When every named section holds the same
 * feel, the result is a same-feel hold so the room does not reset the groove.
 * Stable section ids, rather than display labels, own roadmap targeting. All
 * meaningful section ids are validated for uniqueness before groove evidence
 * is derived so an ineligible or later duplicate cannot create ambiguous cards.
 */
export function firstGrooveChange(song: RehearsalSong): FirstGrooveChange | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const seenSectionIds = new Set<string>();
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    if (!sectionId) {
      continue;
    }
    if (seenSectionIds.has(sectionId)) {
      return null;
    }
    seenSectionIds.add(sectionId);
  }

  const namedGrooves: NamedGroove[] = [];
  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionId = meaningfulRangeText(sectionValue.id);
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    const groove = meaningfulRangeText(sectionValue.groove);
    if (!sectionId || !sectionLabel || !groove) {
      continue;
    }
    namedGrooves.push({ sectionId, sectionLabel, groove });
  }

  if (namedGrooves.length === 0) {
    return null;
  }

  const first = namedGrooves[0];
  for (let index = 1; index < namedGrooves.length; index += 1) {
    const previous = namedGrooves[index - 1];
    const current = namedGrooves[index];
    if (previous.groove !== current.groove) {
      return {
        kind: "change",
        fromSectionId: previous.sectionId,
        fromSectionLabel: previous.sectionLabel,
        fromGroove: previous.groove,
        toSectionId: current.sectionId,
        toSectionLabel: current.sectionLabel,
        toGroove: current.groove
      };
    }
  }

  return {
    kind: "same",
    fromSectionId: first.sectionId,
    fromSectionLabel: first.sectionLabel,
    fromGroove: first.groove,
    toSectionId: first.sectionId,
    toSectionLabel: first.sectionLabel,
    toGroove: first.groove
  };
}

/** Fill trusted `{token}` placeholders for groove-change rehearsal copy. */
export function fillGrooveCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}

/** True when this stable section identity is the map card owning the next groove action. */
export function isGrooveChangeTarget(change: FirstGrooveChange, sectionId: string): boolean {
  const identity = meaningfulRangeText(sectionId);
  return Boolean(identity) && identity === change.toSectionId;
}
