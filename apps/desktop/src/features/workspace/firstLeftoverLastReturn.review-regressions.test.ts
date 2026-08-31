import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftoverLastReturn } from "./firstLeftoverLastReturn";

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

describe("firstLeftoverLastReturn review regressions", () => {
  it("fails closed when several remaining parts return together", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
          "bass-guitar",
          "keys-right",
          "acoustic-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [
          "keys-right",
          "acoustic-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [
          "acoustic-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, [])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("rejects a final return when another part newly drops out in the same section", () => {
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
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("invalidates a remaining-leftover sequence when an untracked role drops and returns before the tracked final return", () => {
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
        sectionWithInactiveRoles(template, "break-1", "break", 60, [
          "bass-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 100, [])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("invalidates a selected-role sequence when an untracked role returns alongside the tracked final role", () => {
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
        sectionWithInactiveRoles(template, "break-1", "break", 60, [
          "bass-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 80, [])
      ]
    };

    expect(firstLeftoverLastReturn(song, "lead-vocal")).toBeNull();
  });

  it("keeps searching after an unrelated complete return for the selected part", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const selectedRole = {
      ...template.roles[0]!,
      id: "selected-part",
      name: "Selected Part"
    };
    const selectedTemplate: RehearsalSong["sections"][number] = {
      ...template,
      roles: [...template.roles, selectedRole],
      partGraph: [
        ...template.partGraph,
        {
          ...template.partGraph[0]!,
          role_id: "selected-part",
          is_active: true,
          handoff_to: [],
          handoff_from: []
        }
      ]
    };
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(selectedTemplate, "verse-1", "verse", 0, [
          "keys-right",
          "acoustic-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "chorus-1", "chorus", 20, [
          "acoustic-guitar",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "bridge-1", "bridge", 40, [
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "outro-1", "outro", 60, []),
        sectionWithInactiveRoles(selectedTemplate, "verse-2", "verse", 80, [
          "selected-part",
          "bass-guitar",
          "keys-right"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "chorus-2", "chorus", 100, [
          "bass-guitar",
          "keys-right"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "bridge-2", "bridge", 120, [
          "keys-right"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "outro-2", "outro", 140, [])
      ]
    };

    expect(firstLeftoverLastReturn(song, "selected-part")).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "keys-right",
      lastRoleName: "Keyboard 1 Right Hand"
    });
  });
});
