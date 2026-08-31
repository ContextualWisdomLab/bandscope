import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftover } from "./firstLeftover";

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

describe("firstLeftover selected-role search", () => {
  it("keeps searching after the selected part newly drops out during an earlier partial return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
          "bass-guitar",
          "keys-right"
        ]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [
          "lead-vocal",
          "keys-right"
        ]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["keys-right"])
      ]
    };

    expect(firstLeftover(song, "lead-vocal")).toEqual({
      sectionLabel: "bridge",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });
});
