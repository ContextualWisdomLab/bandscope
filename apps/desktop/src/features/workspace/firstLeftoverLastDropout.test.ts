import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftoverLastDropout } from "./firstLeftoverLastDropout";

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

function leftoverThenLastReturnThenDropout(
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
      sectionWithInactiveRoles(template, "tag-1", "tag", 80, [dropoutRoleId])
    ]
  };
}

describe("firstLeftoverLastDropout", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftoverLastDropout(createDemoRehearsalSong())).toBeNull();
  });

  it("names the leftover last-dropout after leftover last-return", () => {
    expect(firstLeftoverLastDropout(leftoverThenLastReturnThenDropout())).toEqual({
      sectionLabel: "tag",
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["lead-vocal"], true)
      ]
    };

    expect(firstLeftoverLastDropout(song)).toEqual({
      sectionLabel: "stop",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "tag",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      dropoutRoleId: "lead-vocal",
      dropoutRoleName: "Lead Vocal"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenLastReturnThenDropout();
    song.sections[4] = {
      ...song.sections[4]!,
      label: song.sections[3]!.label
    };

    expect(firstLeftoverLastDropout(song)).toEqual({
      sectionLabel: "outro",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("skips a continued tutti after leftover last-return until the leftover last-dropout", () => {
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
        sectionWithInactiveRoles(template, "coda-1", "stop", 100, ["bass-guitar"])
      ]
    };

    expect(firstLeftoverLastDropout(song)).toEqual({
      sectionLabel: "stop",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "bass-guitar",
      dropoutRoleName: "Bass Guitar"
    });
  });

  it("fails closed when leftover last-return never last-drops", () => {
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

    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("keeps the selected leftover last-dropout on tonight's first leftover last-dropout", () => {
    const song = leftoverThenLastReturnThenDropout();
    expect(firstLeftoverLastDropout(song, "keys-right")).toEqual({
      sectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropout(song, "lead-vocal")).toEqual({
      sectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropout(song, "bass-guitar")).toEqual({
      sectionLabel: "tag",
      lastReturnSectionLabel: "outro",
      remainingSectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      dropoutRoleId: "keys-right",
      dropoutRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverLastDropout(song, "missing-role")).toBeNull();
  });

  it("does not treat a leftover sit-out without leftover return as a leftover last-dropout", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstLeftoverLastDropout({
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

  it("does not treat leftover last-return as a leftover last-dropout", () => {
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

    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("does not treat a leftover return with nobody still out as a leftover last-dropout", () => {
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

    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as a leftover last-dropout", () => {
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

    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as a leftover last-dropout", () => {
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

    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("does not treat a new dropout after remaining leftover as a leftover last-dropout", () => {
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

    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("does not treat remaining leftover without last-return as a leftover last-dropout", () => {
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

    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenLastReturnThenDropout();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as leftover-last-dropout evidence", () => {
    const song = leftoverThenLastReturnThenDropout();
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
    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenLastReturnThenDropout();
    const section = song.sections[4]!;
    const keysNode = section.partGraph.find((node) => node.role_id === "keys-right")!;
    const withoutKeys = section.partGraph.filter((node) => node.role_id !== "keys-right");
    song.sections[4] = {
      ...section,
      partGraph: [...withoutKeys, { ...keysNode, is_active: true }, { ...keysNode, is_active: false }]
    };
    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("skips blank leftover-last-dropout labels until a named leftover last-dropout exists", () => {
    const song = leftoverThenLastReturnThenDropout();
    song.sections[4] = {
      ...song.sections[4]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("fails closed when the leftover last-dropout has no named leftover role", () => {
    const song = leftoverThenLastReturnThenDropout();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenLastReturnThenDropout();
    song.sections[4] = {
      ...song.sections[4]!,
      partGraph: []
    };
    expect(firstLeftoverLastDropout(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstLeftoverLastDropout(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenLastReturnThenDropout();
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
    expect(firstLeftoverLastDropout(song)).toBeNull();
  });
});

describe("leftover-last-dropout copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{dropoutRoleName} sits out at {sectionLabel} after leftover last-return at {lastReturnSectionLabel}.",
        {
          dropoutRoleName: "Keys Right {sectionLabel}",
          sectionLabel: "tag",
          lastReturnSectionLabel: "outro"
        }
      )
    ).toBe("Keys Right {sectionLabel} sits out at tag after leftover last-return at outro.");
  });
});
