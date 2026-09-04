import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftoverLastDropoutRemainingLastReturn } from "./firstLeftoverLastDropoutRemainingLastReturn";

function sectionWithInactiveRoles(
  template: RehearsalSong["sections"][number],
  id: string,
  label: string,
  start: number,
  inactiveRoleIds: readonly string[]
): RehearsalSong["sections"][number] {
  const inactive = new Set(inactiveRoleIds);
  return {
    ...template,
    id,
    label: label as RehearsalSong["sections"][number]["label"],
    timeRange: { start, end: start + 20 },
    partGraph: template.partGraph.map((node) => ({
      ...node,
      is_active: !inactive.has(node.role_id)
    }))
  };
}

describe("firstLeftoverLastDropoutRemainingLastReturn simultaneous final return", () => {
  it("fails closed instead of naming an arbitrary graph-order role when two remaining parts return together", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
          "bass-guitar",
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, []),
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, [
          "bass-guitar",
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "coda-1", "coda", 100, [
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
    expect(firstLeftoverLastDropoutRemainingLastReturn(song, "keys-right")).toBeNull();
  });
});
