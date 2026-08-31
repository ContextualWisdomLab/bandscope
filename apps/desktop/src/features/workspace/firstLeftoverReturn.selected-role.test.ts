import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftoverReturn } from "./firstLeftoverReturn";

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

describe("firstLeftoverReturn selected-role search", () => {
  it("keeps searching after the selected part newly drops out during an earlier leftover sit-out", () => {
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
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["keys-right"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, [])
      ]
    };

    expect(firstLeftoverReturn(song, "lead-vocal")).toEqual({
      sectionLabel: "outro",
      leftoverSectionLabel: "bridge",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("does not show another cohort's leftover return to a continuously active selected role", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
          "bass-guitar",
          "keys-right"
        ]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [])
      ]
    };

    expect(firstLeftoverReturn(song, "lead-vocal")).toBeNull();
  });

  it("returns the first eligible leftover even when a later graph entry returns first", () => {
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
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["keys-right"])
      ]
    };

    expect(firstLeftoverReturn(song)).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "lead-vocal",
      leftoverRoleName: "Lead Vocal"
    });
  });

  it("does not tell a new dropout to come back from an earlier leftover sit-out", () => {
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
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [])
      ]
    };

    expect(firstLeftoverReturn(song, "lead-vocal")).toBeNull();
  });
});
