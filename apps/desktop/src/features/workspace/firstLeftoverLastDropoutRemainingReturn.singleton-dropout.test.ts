import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftoverLastDropoutRemainingReturn } from "./firstLeftoverLastDropoutRemainingReturn";

/** Build a section fixture that keeps role identity stable while changing only activity evidence. */
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

describe("firstLeftoverLastDropoutRemainingReturn singleton dropout provenance", () => {
  it("keeps the completed leftover sequence while a singleton dropout grows into a valid cohort", () => {
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
        sectionWithInactiveRoles(template, "pickup-1", "pickup", 80, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "tag-1", "tag", 100, [
          "bass-guitar",
          "keys-right"
        ]),
        sectionWithInactiveRoles(template, "coda-1", "coda", 120, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "ending-1", "ending", 140, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingReturn(song)).toEqual({
      sectionLabel: "ending",
      remainingSectionLabel: "coda",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar",
      returningRoleId: "bass-guitar",
      returningRoleName: "Bass Guitar"
    });
  });
});
