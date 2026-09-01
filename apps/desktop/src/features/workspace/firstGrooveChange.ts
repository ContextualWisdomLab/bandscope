import type { RehearsalSong } from "@bandscope/shared-types";
import { fillRangeCopy, meaningfulRangeText } from "./firstRangeSqueeze";

/** Tonight's first named feel change, or a same-feel hold through the form. */
export type FirstGrooveChange = {
  kind: "change" | "same";
  fromSectionLabel: string;
  fromGroove: string;
  toSectionLabel: string;
  toGroove: string;
};

type NamedGroove = {
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
 * Runtime roots and collection members are treated as untrusted; malformed
 * evidence is isolated instead of becoming feel-change authority.
 */
export function firstGrooveChange(song: RehearsalSong): FirstGrooveChange | null {
  const runtimeSong: unknown = song;
  if (!isRuntimeObject(runtimeSong) || !Array.isArray(runtimeSong.sections)) {
    return null;
  }

  const namedGrooves: NamedGroove[] = [];

  for (const sectionValue of runtimeSong.sections) {
    if (!isRuntimeObject(sectionValue)) {
      continue;
    }
    const sectionLabel = meaningfulRangeText(sectionValue.label);
    const groove = meaningfulRangeText(sectionValue.groove);
    if (!sectionLabel || !groove) {
      continue;
    }
    namedGrooves.push({ sectionLabel, groove });
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
        fromSectionLabel: previous.sectionLabel,
        fromGroove: previous.groove,
        toSectionLabel: current.sectionLabel,
        toGroove: current.groove
      };
    }
  }

  return {
    kind: "same",
    fromSectionLabel: first.sectionLabel,
    fromGroove: first.groove,
    toSectionLabel: first.sectionLabel,
    toGroove: first.groove
  };
}

/** Fill trusted `{token}` placeholders for groove-change rehearsal copy. */
export function fillGrooveCopy(template: string, values: Record<string, string>): string {
  return fillRangeCopy(template, values);
}

/** True when this labeled section is the map card that should name the next groove action. */
export function isGrooveChangeTarget(change: FirstGrooveChange, sectionLabel: string): boolean {
  const label = meaningfulRangeText(sectionLabel);
  return Boolean(label) && label === change.toSectionLabel;
}
