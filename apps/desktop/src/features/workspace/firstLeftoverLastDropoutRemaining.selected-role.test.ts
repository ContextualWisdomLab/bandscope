import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftoverLastDropoutRemaining } from "./firstLeftoverLastDropoutRemaining";

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

describe("firstLeftoverLastDropoutRemaining selected-role search", () => {
  it("keeps searching after the selected part newly drops out during leftover last-return tutti", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, []),
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutRemaining(song, "bass-guitar")).toEqual({
      sectionLabel: "ending",
      dropoutSectionLabel: "stop",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("does not tell a leftover last-dropout without leftover last-dropout remaining to stay out", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["keys-right", "bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutRemaining(song, "bass-guitar")).toBeNull();
  });

  it("does not show another part's leftover last-dropout remaining to a selected part that stayed active", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const selectedRole = {
      ...template.roles[0]!,
      id: "always-active",
      name: "Always Active"
    };
    const selectedTemplate: RehearsalSong["sections"][number] = {
      ...template,
      roles: [...template.roles, selectedRole],
      partGraph: [
        ...template.partGraph,
        {
          ...template.partGraph[0]!,
          role_id: "always-active",
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
          "bass-guitar",
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "chorus-1", "chorus", 20, [
          "keys-right",
          "lead-vocal"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "bridge-1", "bridge", 40, ["lead-vocal"]),
        sectionWithInactiveRoles(selectedTemplate, "outro-1", "outro", 60, []),
        sectionWithInactiveRoles(selectedTemplate, "tag-1", "tag", 80, ["keys-right", "bass-guitar"]),
        sectionWithInactiveRoles(selectedTemplate, "coda-1", "stop", 100, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutRemaining(song, "always-active")).toBeNull();
  });
});
