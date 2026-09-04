import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftoverLastDropoutRemainingLastReturn } from "./firstLeftoverLastDropoutRemainingLastReturn";

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

function leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn(
  remainingRoleId = "bass-guitar",
  returningDropoutId = "keys-right",
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
      sectionWithInactiveRoles(template, "tag-1", "tag", 80, [
        remainingRoleId,
        returningDropoutId
      ]),
      sectionWithInactiveRoles(template, "coda-1", "stop", 100, [remainingRoleId]),
      sectionWithInactiveRoles(template, "ending-1", "ending", 120, [])
    ]
  };
}

describe("firstLeftoverLastDropoutRemainingLastReturn", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftoverLastDropoutRemainingLastReturn(createDemoRehearsalSong())).toBeNull();
  });

  it("names the leftover last-dropout remaining last-return after leftover last-dropout remaining", () => {
    expect(
      firstLeftoverLastDropoutRemainingLastReturn(
        leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn()
      )
    ).toEqual({
      sectionLabel: "ending",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["keys-right", "bass-guitar"], true),
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["bass-guitar"], true),
        sectionWithInactiveRoles(template, "fine-1", "fine", 140, [], true)
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toEqual({
      sectionLabel: "fine",
      remainingSectionLabel: "ending",
      dropoutSectionLabel: "stop",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
    song.sections[6] = {
      ...song.sections[6]!,
      label: song.sections[5]!.label
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toEqual({
      sectionLabel: "stop",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
  });

  it("skips continued leftover last-dropout remaining until leftover last-dropout remaining last-return", () => {
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
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["bass-guitar"]),
        sectionWithInactiveRoles(template, "fine-1", "fine", 140, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toEqual({
      sectionLabel: "fine",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
  });

  it("fails closed when leftover last-dropout remaining never last-returns", () => {
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("keeps the selected leftover last-dropout remaining last-return on tonight's first leftover last-dropout remaining last-return", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
    expect(firstLeftoverLastDropoutRemainingLastReturn(song, "bass-guitar")).toEqual({
      sectionLabel: "ending",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
    expect(firstLeftoverLastDropoutRemainingLastReturn(song, "keys-right")).toEqual({
      sectionLabel: "ending",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
    expect(firstLeftoverLastDropoutRemainingLastReturn(song, "lead-vocal")).toEqual({
      sectionLabel: "ending",
      remainingSectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
    expect(firstLeftoverLastDropoutRemainingLastReturn(song, "missing-role")).toBeNull();
  });

  it("does not treat leftover last-dropout remaining as leftover last-dropout remaining last-return", () => {
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat leftover last-dropout as leftover last-dropout remaining last-return", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat leftover last-dropout return with nobody still out as leftover last-dropout remaining last-return", () => {
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat leftover last-return as leftover last-dropout remaining last-return", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat remaining leftover at leftover return as leftover last-dropout remaining last-return", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat a leftover sit-out without leftover return as leftover last-dropout remaining last-return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstLeftoverLastDropoutRemainingLastReturn({
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

  it("does not treat a leftover return with nobody still out as leftover last-dropout remaining last-return", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as leftover last-dropout remaining last-return", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as leftover last-dropout remaining last-return", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat a new dropout after remaining leftover as leftover last-dropout remaining last-return", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat a singleton leftover last-dropout return as leftover last-dropout remaining last-return", () => {
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as leftover-last-dropout-remaining-last-return evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
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
    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
    const section = song.sections[6]!;
    const bassNode = section.partGraph.find((node) => node.role_id === "bass-guitar")!;
    const withoutBass = section.partGraph.filter((node) => node.role_id !== "bass-guitar");
    song.sections[6] = {
      ...section,
      partGraph: [...withoutBass, { ...bassNode, is_active: true }, { ...bassNode, is_active: false }]
    };
    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("skips blank leftover-last-dropout-remaining-last-return labels until a named leftover last-dropout remaining last-return exists", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
    song.sections[6] = {
      ...song.sections[6]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("fails closed when leftover last-dropout remaining last-return has no named leftover role", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
    song.sections[6] = {
      ...song.sections[6]!,
      partGraph: []
    };
    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(
        firstLeftoverLastDropoutRemainingLastReturn(malformed as unknown as RehearsalSong)
      ).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturn();
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
    expect(firstLeftoverLastDropoutRemainingLastReturn(song)).toBeNull();
  });
});

describe("leftover-last-dropout-remaining-last-return copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{remainingRoleName} comes back at {sectionLabel} after leftover last-dropout remaining at {remainingSectionLabel}.",
        {
          remainingRoleName: "Bass Guitar {sectionLabel}",
          sectionLabel: "ending",
          remainingSectionLabel: "stop"
        }
      )
    ).toBe(
      "Bass Guitar {sectionLabel} comes back at ending after leftover last-dropout remaining at stop."
    );
  });
});
