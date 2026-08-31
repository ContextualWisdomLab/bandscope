import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftoverLastDropoutRemainingLastReturnTutti } from "./firstLeftoverLastDropoutRemainingLastReturnTutti";

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

function leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti(
  remainingRoleId = "bass-guitar",
  returningDropoutId = "keys-right",
  lastRoleId = "lead-vocal",
  returningLeftoverId = "keys-right",
  originalSitOutRoleId = "bass-guitar",
  leftoverAtLastReturnId = "lead-vocal"
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
      sectionWithInactiveRoles(template, "ending-1", "ending", 120, [leftoverAtLastReturnId]),
      sectionWithInactiveRoles(template, "fine-1", "fine", 140, [])
    ]
  };
}

describe("firstLeftoverLastDropoutRemainingLastReturnTutti", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(createDemoRehearsalSong())).toBeNull();
  });

  it("names leftover last-dropout remaining last-return tutti after leftover last-dropout remaining last-return", () => {
    expect(
      firstLeftoverLastDropoutRemainingLastReturnTutti(
        leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti()
      )
    ).toEqual({
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
        sectionWithInactiveRoles(template, "wait-1", "wait", 140, ["lead-vocal"], true),
        sectionWithInactiveRoles(template, "fine-1", "fine", 160, [], true)
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toEqual({
      sectionLabel: "fine",
      remainingLastReturnSectionLabel: "wait",
      remainingSectionLabel: "ending",
      dropoutSectionLabel: "stop",
      lastReturnSectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar"
    });
  });

  it("does not treat leftover last-dropout remaining last-return that is already all-in as leftover last-dropout remaining last-return tutti", () => {
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
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("fails closed when leftover last-dropout remaining last-return never tuttis", () => {
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
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["lead-vocal"])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("keeps searching after continued leftover at leftover last-dropout remaining last-return until tutti", () => {
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
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "wait-1", "wait", 140, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "fine-1", "fine", 160, [])
      ]
    };

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toEqual({
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

  it("keeps the selected leftover last-dropout remaining last-return tutti on tonight's first leftover last-dropout remaining last-return tutti", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song, "bass-guitar")).toEqual({
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
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song, "keys-right")).toEqual({
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
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song, "missing-role")).toBeNull();
  });

  it("does not treat leftover last-dropout remaining as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat leftover last-dropout return with nobody still out as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat leftover last-return as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat remaining leftover at leftover return as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat a leftover sit-out without leftover return as leftover last-dropout remaining last-return tutti", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstLeftoverLastDropoutRemainingLastReturnTutti({
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

  it("does not treat a leftover return with nobody still out as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat a new dropout after remaining leftover as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat a singleton leftover last-dropout return as leftover last-dropout remaining last-return tutti", () => {
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

    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as leftover-last-dropout-remaining-last-return-tutti evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
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
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
    const section = song.sections[7]!;
    const bassNode = section.partGraph.find((node) => node.role_id === "bass-guitar")!;
    const withoutBass = section.partGraph.filter((node) => node.role_id !== "bass-guitar");
    song.sections[7] = {
      ...section,
      partGraph: [...withoutBass, { ...bassNode, is_active: true }, { ...bassNode, is_active: false }]
    };
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("skips blank leftover-last-dropout-remaining-last-return-tutti labels until a named leftover last-dropout remaining last-return tutti exists", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
    song.sections[7] = {
      ...song.sections[7]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("fails closed when leftover last-dropout remaining last-return tutti has no named leftover role", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
    song.sections[7] = {
      ...song.sections[7]!,
      partGraph: []
    };
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(
        firstLeftoverLastDropoutRemainingLastReturnTutti(malformed as unknown as RehearsalSong)
      ).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemainingThenLastReturnThenTutti();
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
    expect(firstLeftoverLastDropoutRemainingLastReturnTutti(song)).toBeNull();
  });
});

describe("leftover-last-dropout-remaining-last-return-tutti copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{remainingRoleName} comes back at {remainingLastReturnSectionLabel} after leftover last-dropout remaining at {remainingSectionLabel}, and the band is all in at {sectionLabel}.",
        {
          remainingRoleName: "Bass Guitar {sectionLabel}",
          remainingLastReturnSectionLabel: "ending",
          remainingSectionLabel: "stop",
          sectionLabel: "fine"
        }
      )
    ).toBe(
      "Bass Guitar {sectionLabel} comes back at ending after leftover last-dropout remaining at stop, and the band is all in at fine."
    );
  });
});
