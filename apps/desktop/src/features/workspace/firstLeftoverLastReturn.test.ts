import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftoverLastReturn } from "./firstLeftoverLastReturn";

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

function leftoverThenLastReturn(
  lastRoleId = "lead-vocal",
  returningLeftoverId = "keys-right",
  originalSitOutRoleId = "bass-guitar"
): RehearsalSong {
  const seed = createDemoRehearsalSong();
  const template = seed.sections[0]!;
  return {
    ...seed,
    sections: [
      sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
        originalSitOutRoleId,
        returningLeftoverId,
        lastRoleId
      ]),
      sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [
        returningLeftoverId,
        lastRoleId
      ]),
      sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [lastRoleId]),
      sectionWithInactiveRoles(template, "outro-1", "outro", 60, [])
    ]
  };
}

describe("firstLeftoverLastReturn", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftoverLastReturn(createDemoRehearsalSong())).toBeNull();
  });

  it("names the leftover last-return after remaining leftover", () => {
    expect(firstLeftoverLastReturn(leftoverThenLastReturn())).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "lead-vocal",
      lastRoleName: "Lead Vocal"
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 60, ["lead-vocal"], true),
        sectionWithInactiveRoles(template, "outro-1", "outro", 80, [], true)
      ]
    };

    expect(firstLeftoverLastReturn(song)).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "tag",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      lastRoleId: "lead-vocal",
      lastRoleName: "Lead Vocal"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenLastReturn();
    song.sections[3] = {
      ...song.sections[3]!,
      label: song.sections[2]!.label
    };

    expect(firstLeftoverLastReturn(song)).toEqual({
      sectionLabel: "bridge",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "lead-vocal",
      lastRoleName: "Lead Vocal"
    });
  });

  it("shrinks remaining leftover until the leftover last-return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const backing = {
      ...template.roles[0]!,
      id: "backing-vocal",
      name: "Backing Vocal"
    };
    const withBacking: RehearsalSong["sections"][number] = {
      ...template,
      roles: [...template.roles, backing],
      partGraph: [
        ...template.partGraph,
        {
          ...template.partGraph[0]!,
          role_id: "backing-vocal",
          is_active: true,
          handoff_to: [],
          handoff_from: []
        }
      ]
    };
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(withBacking, "verse-1", "verse", 0, [
          "bass-guitar",
          "keys-right",
          "lead-vocal",
          "backing-vocal"
        ]),
        sectionWithInactiveRoles(withBacking, "chorus-1", "chorus", 20, [
          "keys-right",
          "lead-vocal",
          "backing-vocal"
        ]),
        sectionWithInactiveRoles(withBacking, "bridge-1", "bridge", 40, [
          "lead-vocal",
          "backing-vocal"
        ]),
        sectionWithInactiveRoles(withBacking, "tag-1", "tag", 60, ["backing-vocal"]),
        sectionWithInactiveRoles(withBacking, "outro-1", "outro", 80, [])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "tag",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "backing-vocal",
      lastRoleName: "Backing Vocal"
    });
  });

  it("skips a continued remaining leftover until the leftover last-return", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 60, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 80, [])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "lead-vocal",
      lastRoleName: "Lead Vocal"
    });
  });

  it("fails closed when remaining leftover never last-returns", () => {
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
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["lead-vocal"])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("keeps the selected leftover last-return on tonight's first leftover last-return", () => {
    const song = leftoverThenLastReturn();
    expect(firstLeftoverLastReturn(song, "lead-vocal")).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "lead-vocal",
      lastRoleName: "Lead Vocal"
    });
    expect(firstLeftoverLastReturn(song, "keys-right")).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "lead-vocal",
      lastRoleName: "Lead Vocal"
    });
    expect(firstLeftoverLastReturn(song, "bass-guitar")).toEqual({
      sectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      lastRoleId: "lead-vocal",
      lastRoleName: "Lead Vocal"
    });
    expect(firstLeftoverLastReturn(song, "missing-role")).toBeNull();
  });

  it("does not treat a leftover sit-out without leftover return as a leftover last-return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstLeftoverLastReturn({
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

  it("does not treat a leftover return with nobody still out as a leftover last-return", () => {
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

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as a leftover last-return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as a leftover last-return", () => {
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

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("does not treat a new dropout after remaining leftover as a leftover last-return", () => {
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
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["bass-guitar", "lead-vocal"])
      ]
    };

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("does not treat a continued sit-out with nobody returning as a leftover last-return", () => {
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

    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenLastReturn();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as leftover-last-return evidence", () => {
    const song = leftoverThenLastReturn();
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
    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenLastReturn();
    const section = song.sections[3]!;
    const leadNode = section.partGraph.find((node) => node.role_id === "lead-vocal")!;
    const withoutLead = section.partGraph.filter((node) => node.role_id !== "lead-vocal");
    song.sections[3] = {
      ...section,
      partGraph: [...withoutLead, { ...leadNode, is_active: true }, { ...leadNode, is_active: false }]
    };
    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("skips blank leftover-last-return labels until a named leftover last-return exists", () => {
    const song = leftoverThenLastReturn();
    song.sections[3] = {
      ...song.sections[3]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("fails closed when the leftover last-return has no named leftover role", () => {
    const song = leftoverThenLastReturn();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenLastReturn();
    song.sections[3] = {
      ...song.sections[3]!,
      partGraph: []
    };
    expect(firstLeftoverLastReturn(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstLeftoverLastReturn(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenLastReturn();
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
    expect(firstLeftoverLastReturn(song)).toBeNull();
  });
});

describe("leftover-last-return copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{lastRoleName} comes back last at {sectionLabel} after staying leftover from {remainingSectionLabel}.",
        {
          lastRoleName: "Lead Vocal {sectionLabel}",
          sectionLabel: "outro",
          remainingSectionLabel: "bridge"
        }
      )
    ).toBe(
      "Lead Vocal {sectionLabel} comes back last at outro after staying leftover from bridge."
    );
  });
});
