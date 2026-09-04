import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftoverLastDropoutReturn } from "./firstLeftoverLastDropoutReturn";

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

function leftoverThenLastReturnThenDropoutThenReturn(
  dropoutRoleId = "keys-right",
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
      sectionWithInactiveRoles(template, "outro-1", "outro", 60, []),
      sectionWithInactiveRoles(template, "tag-1", "tag", 80, [dropoutRoleId]),
      sectionWithInactiveRoles(template, "coda-1", "stop", 100, [])
    ]
  };
}

describe("firstLeftoverLastDropoutReturn", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftoverLastDropoutReturn(createDemoRehearsalSong())).toBeNull();
  });

  it("names the leftover last-dropout return after leftover last-dropout", () => {
    expect(firstLeftoverLastDropoutReturn(leftoverThenLastReturnThenDropoutThenReturn())).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
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
        sectionWithInactiveRoles(template, "outro-1", "outro", 80, [], true),
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["lead-vocal"], true),
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, [], true)
      ]
    };

    expect(firstLeftoverLastDropoutReturn(song)).toEqual({
      sectionLabel: "ending",
      dropoutSectionLabel: "stop",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "tag",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
    song.sections[5] = {
      ...song.sections[5]!,
      label: song.sections[4]!.label
    };

    expect(firstLeftoverLastDropoutReturn(song)).toEqual({
      sectionLabel: "tag",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("skips a continued leftover last-dropout until the leftover last-dropout return", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["keys-right"]),
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["keys-right"]),
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, [])
      ]
    };

    expect(firstLeftoverLastDropoutReturn(song)).toEqual({
      sectionLabel: "ending",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("fails closed when leftover last-dropout never returns", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["keys-right"])
      ]
    };

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("keeps the selected leftover last-dropout return on tonight's first leftover last-dropout return", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
    expect(firstLeftoverLastDropoutReturn(song, "keys-right")).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropoutReturn(song, "lead-vocal")).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropoutReturn(song, "bass-guitar")).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropoutReturn(song, "missing-role")).toBeNull();
  });

  it("does not treat a leftover sit-out without leftover return as a leftover last-dropout return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstLeftoverLastDropoutReturn({
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

  it("does not treat leftover last-dropout as a leftover last-dropout return", () => {
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
        sectionWithInactiveRoles(template, "tag-1", "tag", 80, ["keys-right"])
      ]
    };

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("does not treat leftover last-return as a leftover last-dropout return", () => {
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
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, [])
      ]
    };

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("does not treat a leftover return with nobody still out as a leftover last-dropout return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"]),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, []),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as a leftover last-dropout return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as a leftover last-dropout return", () => {
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

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("does not treat a new dropout after remaining leftover as a leftover last-dropout return", () => {
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

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("does not treat remaining leftover without last-return as a leftover last-dropout return", () => {
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

    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as leftover-last-dropout-return evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
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
    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
    const section = song.sections[5]!;
    const keysNode = section.partGraph.find((node) => node.role_id === "keys-right")!;
    const withoutKeys = section.partGraph.filter((node) => node.role_id !== "keys-right");
    song.sections[5] = {
      ...section,
      partGraph: [...withoutKeys, { ...keysNode, is_active: true }, { ...keysNode, is_active: false }]
    };
    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("skips blank leftover-last-dropout-return labels until a named leftover last-dropout return exists", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
    song.sections[5] = {
      ...song.sections[5]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("fails closed when the leftover last-dropout has no named leftover role", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
    song.sections[5] = {
      ...song.sections[5]!,
      partGraph: []
    };
    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstLeftoverLastDropoutReturn(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenLastReturnThenDropoutThenReturn();
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
    expect(firstLeftoverLastDropoutReturn(song)).toBeNull();
  });
});

describe("leftover-last-dropout-return copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{dropoutRoleName} comes in at {sectionLabel} after leftover last-dropout at {dropoutSectionLabel}.",
        {
          dropoutRoleName: "Keys Right {sectionLabel}",
          sectionLabel: "stop",
          dropoutSectionLabel: "tag"
        }
      )
    ).toBe("Keys Right {sectionLabel} comes in at stop after leftover last-dropout at tag.");
  });
});
