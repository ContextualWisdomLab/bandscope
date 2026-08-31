import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstLeftoverLastDropoutRemainingLastReturnTutti } from "./firstLeftoverLastDropoutRemainingLastReturnTutti";

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

function sectionTemplateWithObserver(
  template: RehearsalSong["sections"][number]
): RehearsalSong["sections"][number] {
  const referenceRole = template.roles[0]!;
  const referenceNode = template.partGraph[0]!;
  return {
    ...template,
    roles: [
      ...template.roles,
      {
        ...referenceRole,
        id: "observer",
        name: "Observer"
      }
    ],
    partGraph: [
      ...template.partGraph,
      {
        ...referenceNode,
        role_id: "observer",
        handoff_to: [],
        handoff_from: []
      }
    ]
  };
}

describe("firstLeftoverLastDropoutRemainingLastReturnTutti selected-role search", () => {
  it("keeps searching after the selected part newly drops out during leftover last-dropout remaining last-return", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "fine-1", "fine", 140, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song, "lead-vocal")).toEqual({
      sectionLabel: "fine",
      remainingLastReturnSectionLabel: "ending",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
  });

  it("keeps searching after an earlier completed sequence excludes the selected part", () => {
    const seed = createDemoRehearsalSong();
    const template = sectionTemplateWithObserver(seed.sections[0]!);
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "stop-1", "stop", 100, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "ending-1", "outro", 120, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "fine-1", "outro", 140, []),
        sectionWithInactiveRoles(template, "verse-2", "verse", 160, [
          "observer",
          "bass-guitar",
          "keys-right"
        ]),
        sectionWithInactiveRoles(template, "chorus-2", "chorus", 180, [
          "bass-guitar",
          "keys-right"
        ]),
        sectionWithInactiveRoles(template, "bridge-2", "bridge", 200, ["keys-right"]),
        sectionWithInactiveRoles(template, "outro-2", "outro", 220, []),
        sectionWithInactiveRoles(template, "tag-2", "tag", 240, ["observer", "bass-guitar"]),
        sectionWithInactiveRoles(template, "stop-2", "stop", 260, ["observer"]),
        sectionWithInactiveRoles(template, "ending-2", "outro", 280, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "fine-2", "outro", 300, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song, "observer")).toEqual({
      sectionLabel: "outro",
      remainingLastReturnSectionLabel: "outro",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "observer",
      remainingRoleName: "Observer"
    });
  });

  it("does not tell leftover last-dropout remaining last-return without leftover last-dropout remaining last-return tutti to come in together", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["keys-right", "bass-guitar"]),
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "ending-1", "outro", 120, ["lead-vocal"])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song, "bass-guitar")).toBeNull();
  });
});
