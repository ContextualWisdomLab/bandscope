import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftoverLastDropoutRemaining } from "./firstLeftoverLastDropoutRemaining";

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

function leftoverThenLastReturnThenDropoutThenRemaining(
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
      sectionWithInactiveRoles(template, "coda-1", "stop", 100, [remainingRoleId])
    ]
  };
}

describe("firstLeftoverLastDropoutRemaining", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftoverLastDropoutRemaining(createDemoRehearsalSong())).toBeNull();
  });

  it("names the leftover last-dropout remaining after leftover last-dropout", () => {
    expect(firstLeftoverLastDropoutRemaining(leftoverThenLastReturnThenDropoutThenRemaining())).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
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
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["bass-guitar"], true)
      ]
    };

    expect(firstLeftoverLastDropoutRemaining(song)).toEqual({
      sectionLabel: "ending",
      dropoutSectionLabel: "stop",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "tag",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
    song.sections[5] = {
      ...song.sections[5]!,
      label: song.sections[4]!.label
    };

    expect(firstLeftoverLastDropoutRemaining(song)).toEqual({
      sectionLabel: "tag",
      dropoutSectionLabel: "tag",
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

  it("skips a continued leftover last-dropout until leftover last-dropout remaining", () => {
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["keys-right", "bass-guitar"]),
        sectionWithInactiveRoles(template, "ending-1", "ending", 120, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropoutRemaining(song)).toEqual({
      sectionLabel: "ending",
      dropoutSectionLabel: "tag",
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

  it("fails closed when leftover last-dropout never leaves a remaining leftover last-dropout", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("keeps the selected leftover last-dropout remaining on tonight's first leftover last-dropout remaining", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
    expect(firstLeftoverLastDropoutRemaining(song, "bass-guitar")).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropoutRemaining(song, "keys-right")).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropoutRemaining(song, "lead-vocal")).toEqual({
      sectionLabel: "stop",
      dropoutSectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      remainingRoleId: "bass-guitar",
      remainingRoleName: "Bass Guitar",
      returningRoleId: "keys-right",
      returningRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropoutRemaining(song, "missing-role")).toBeNull();
  });

  it("does not treat a leftover sit-out without leftover return as leftover last-dropout remaining", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstLeftoverLastDropoutRemaining({
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

  it("does not treat leftover last-dropout as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat leftover last-dropout return as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat a singleton leftover last-dropout return as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat leftover last-return as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat a leftover return with nobody still out as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat remaining leftover at leftover return as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat a new dropout after remaining leftover as leftover last-dropout remaining", () => {
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

    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as leftover-last-dropout-remaining evidence", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
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
    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
    const section = song.sections[5]!;
    const keysNode = section.partGraph.find((node) => node.role_id === "keys-right")!;
    const withoutKeys = section.partGraph.filter((node) => node.role_id !== "keys-right");
    song.sections[5] = {
      ...section,
      partGraph: [...withoutKeys, { ...keysNode, is_active: true }, { ...keysNode, is_active: false }]
    };
    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("skips blank leftover-last-dropout-remaining labels until a named leftover last-dropout remaining exists", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
    song.sections[5] = {
      ...song.sections[5]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("fails closed when the leftover last-dropout remaining has no named leftover role", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
    song.sections[5] = {
      ...song.sections[5]!,
      partGraph: []
    };
    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstLeftoverLastDropoutRemaining(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenLastReturnThenDropoutThenRemaining();
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
    expect(firstLeftoverLastDropoutRemaining(song)).toBeNull();
  });
});

describe("leftover-last-dropout-remaining copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{remainingRoleName} stays out at {sectionLabel} while {returningRoleName} comes back from leftover last-dropout at {dropoutSectionLabel}.",
        {
          remainingRoleName: "Bass Guitar {sectionLabel}",
          returningRoleName: "Keyboard 1 Right Hand",
          sectionLabel: "stop",
          dropoutSectionLabel: "tag"
        }
      )
    ).toBe(
      "Bass Guitar {sectionLabel} stays out at stop while Keyboard 1 Right Hand comes back from leftover last-dropout at tag."
    );
  });
});
