import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstRemainingLeftover } from "./firstRemainingLeftover";

function sectionWithInactiveRoles(
  template: RehearsalSong["sections"][number],
  id: string,
  label: string,
  start: number,
  inactiveRoleIds: readonly string[],
  activeOnlyRoles = false
): RehearsalSong["sections"][number] {
  const inactive = new Set(inactiveRoleIds);
  const partGraph = template.partGraph.map((node) => ({
    ...node,
    is_active: !inactive.has(node.role_id)
  }));
  return {
    ...template,
    id,
    label: label as RehearsalSong["sections"][number]["label"],
    timeRange: { start, end: start + 20 },
    partGraph,
    roles: activeOnlyRoles
      ? template.roles.filter((role) => !inactive.has(role.id))
      : template.roles
  };
}

function leftoverThenRemainingReturn(
  returningRoleId = "keys-right",
  remainingRoleId = "lead-vocal",
  originalSitOutRoleId = "bass-guitar"
): RehearsalSong {
  const seed = createDemoRehearsalSong();
  const template = seed.sections[0]!;
  return {
    ...seed,
    sections: [
      sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
        originalSitOutRoleId,
        returningRoleId,
        remainingRoleId
      ]),
      sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [
        returningRoleId,
        remainingRoleId
      ]),
      sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [remainingRoleId])
    ]
  };
}

describe("firstRemainingLeftover", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstRemainingLeftover(createDemoRehearsalSong())).toBeNull();
  });

  it("names the remaining leftover at a leftover return", () => {
    expect(firstRemainingLeftover(leftoverThenRemainingReturn())).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("uses song-wide role names when inactive analysis roles are omitted from section roles", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "opening-1", "opening", 0, []),
        sectionWithInactiveRoles(
          template,
          "bridge-1",
          "bridge",
          20,
          ["bass-guitar", "keys-right", "lead-vocal"],
          true
        ),
        sectionWithInactiveRoles(
          template,
          "chorus-1",
          "chorus",
          40,
          ["keys-right", "lead-vocal"],
          true
        ),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["lead-vocal"], true)
      ]
    };

    expect(firstRemainingLeftover(song)).toEqual({
      sectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenRemainingReturn();
    song.sections[2] = {
      ...song.sections[2]!,
      label: song.sections[1]!.label
    };

    expect(firstRemainingLeftover(song)).toEqual({
      sectionLabel: "chorus",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("skips a continued leftover sit-out until a leftover return leaves a remaining leftover", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 40, ["keys-right", "lead-vocal"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["lead-vocal"])
      ]
    };

    expect(firstRemainingLeftover(song)).toEqual({
      sectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("fails closed when the leftover return has no remaining leftover", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [])
      ]
    };

    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("keeps the selected remaining leftover and returning leftover on tonight's first remaining leftover", () => {
    const song = leftoverThenRemainingReturn();
    expect(firstRemainingLeftover(song, "lead-vocal")).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstRemainingLeftover(song, "keys-right")).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstRemainingLeftover(song, "bass-guitar")).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "lead-vocal",
      remainingRoleName: "Lead Vocal",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstRemainingLeftover(song, "missing-role")).toBeNull();
  });

  it("does not treat a leftover sit-out without a later leftover return as a remaining leftover", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstRemainingLeftover({
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
          ])
        ]
      })
    ).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as a remaining leftover", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [])
      ]
    };

    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as a remaining leftover", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [])
      ]
    };

    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("does not treat a new dropout after every original sit-out returns as a remaining leftover", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"])
      ]
    };

    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("does not treat a continued sit-out with nobody returning as a remaining leftover", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [])
      ]
    };

    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenRemainingReturn();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as remaining-leftover evidence", () => {
    const song = leftoverThenRemainingReturn();
    song.sections[1] = {
      ...song.sections[1]!,
      partGraph: song.sections[1]!.partGraph.map((node) => {
        if (node.role_id !== "keys-right") {
          return node;
        }
        const rest: Record<string, unknown> = {
          role_id: node.role_id,
          handoff_to: node.handoff_to,
          handoff_from: node.handoff_from
        };
        return rest as RehearsalSong["sections"][number]["partGraph"][number];
      })
    };
    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenRemainingReturn();
    const section = song.sections[2]!;
    const keysNode = section.partGraph.find((node) => node.role_id === "keys-right")!;
    const withoutKeys = section.partGraph.filter((node) => node.role_id !== "keys-right");
    song.sections[2] = {
      ...section,
      partGraph: [...withoutKeys, { ...keysNode, is_active: true }, { ...keysNode, is_active: false }]
    };
    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("skips blank leftover-return labels until a named remaining leftover exists", () => {
    const song = leftoverThenRemainingReturn();
    song.sections[2] = {
      ...song.sections[2]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("fails closed when the later section has no named leftover role", () => {
    const song = leftoverThenRemainingReturn();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenRemainingReturn();
    song.sections[2] = {
      ...song.sections[2]!,
      partGraph: []
    };
    expect(firstRemainingLeftover(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstRemainingLeftover(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenRemainingReturn();
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [
        { role_id: "   ", is_active: false, handoff_to: [], handoff_from: [] },
        { role_id: "ghost", is_active: false, handoff_to: [], handoff_from: [] },
        {
          role_id: "keys-right",
          is_active: "no" as unknown as boolean,
          handoff_to: [],
          handoff_from: []
        },
        ...song.sections[0]!.partGraph
      ]
    };
    expect(firstRemainingLeftover(song)).toBeNull();
  });
});

describe("remaining-leftover copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{remainingRoleName} stays out at {sectionLabel} while {returningRoleName} comes back from {leftoverSectionLabel}.",
        {
          remainingRoleName: "Lead Vocal {sectionLabel}",
          returningRoleName: "Keyboard 1 Right Hand",
          sectionLabel: "bridge",
          leftoverSectionLabel: "chorus"
        }
      )
    ).toBe(
      "Lead Vocal {sectionLabel} stays out at bridge while Keyboard 1 Right Hand comes back from chorus."
    );
  });
});
