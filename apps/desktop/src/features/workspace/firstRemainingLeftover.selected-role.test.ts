import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstRemainingLeftover } from "./firstRemainingLeftover";

function sectionWithInactiveRoles(
  template: RehearsalSong["sections"][number],
  id: string,
  label: RehearsalSong["sections"][number]["label"],
  start: number,
  inactiveRoleIds: readonly string[]
): RehearsalSong["sections"][number] {
  const inactive = new Set(inactiveRoleIds);
  return {
    ...template,
    id,
    label,
    timeRange: { start, end: start + 20 },
    partGraph: template.partGraph.map((node) => ({
      ...node,
      is_active: !inactive.has(node.role_id)
    }))
  };
}

describe("firstRemainingLeftover selected-role search", () => {
  it("keeps searching after the selected part newly drops out during an earlier leftover sit-out", () => {
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
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [
          "bass-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["lead-vocal"])
      ]
    };

    expect(firstRemainingLeftover(song, "bass-guitar")).toEqual({
      sectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("does not tell a new dropout to stay out from an earlier leftover sit-out", () => {
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
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["bass-guitar", "lead-vocal"])
      ]
    };

    expect(firstRemainingLeftover(song, "bass-guitar")).toBeNull();
  });
});
