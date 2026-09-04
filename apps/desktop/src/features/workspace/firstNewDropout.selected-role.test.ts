import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstNewDropout } from "./firstNewDropout";

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

describe("firstNewDropout selected-role search", () => {
  it("keeps searching after the selected part newly drops out during an earlier leftover sit-out", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right", "lead-vocal"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["lead-vocal"])
      ]
    };

    expect(firstNewDropout(song, "lead-vocal")).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "bridge",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 2
    });
  });

  it("does not tell a leftover sit-out to stay out as a new dropout", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right", "lead-vocal"])
      ]
    };

    expect(firstNewDropout(song, "lead-vocal")).toBeNull();
    expect(firstNewDropout(song, "keys-right")).toBeNull();
  });

  it("does not show another part's new-dropout cue to a selected leftover that never returned", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["keys-right", "lead-vocal"])
      ]
    };

    expect(firstNewDropout(song, "keys-right")).toBeNull();
  });

  it("does not show another part's new-dropout cue to a selected part that stayed active through an earlier leftover sit-out only", () => {
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
          "keys-right"
        ]),
        sectionWithInactiveRoles(selectedTemplate, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(selectedTemplate, "bridge-1", "bridge", 40, ["lead-vocal"])
      ]
    };

    expect(firstNewDropout(song, "always-active")).toEqual({
      sectionLabel: "bridge",
      returnSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal",
      sectionIndex: 2
    });
  });
});
