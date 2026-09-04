import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftoverReturn } from "./firstLeftoverReturn";

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

function leftoverThenReturn(
  returningRoleId = "bass-guitar",
  leftoverRoleId = "keys-right"
): RehearsalSong {
  const seed = createDemoRehearsalSong();
  const template = seed.sections[0]!;
  return {
    ...seed,
    sections: [
      sectionWithInactiveRoles(template, "verse-1", "verse", 0, [
        returningRoleId,
        leftoverRoleId
      ]),
      sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [leftoverRoleId]),
      sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, [])
    ]
  };
}

describe("firstLeftoverReturn", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftoverReturn(createDemoRehearsalSong())).toBeNull();
  });

  it("names the leftover return after a leftover sit-out", () => {
    expect(firstLeftoverReturn(leftoverThenReturn())).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
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
          ["bass-guitar", "keys-right"],
          true
        ),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 40, ["keys-right"], true),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, [], true)
      ]
    };

    expect(firstLeftoverReturn(song)).toEqual({
      sectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "bridge",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = leftoverThenReturn();
    song.sections[2] = {
      ...song.sections[2]!,
      label: song.sections[1]!.label
    };

    expect(firstLeftoverReturn(song)).toEqual({
      sectionLabel: "chorus",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("skips a continued leftover sit-out until the leftover part is own-property active", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"]),
        sectionWithInactiveRoles(template, "tag-1", "tag", 40, ["keys-right"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, [])
      ]
    };

    expect(firstLeftoverReturn(song)).toEqual({
      sectionLabel: "outro",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("fails closed when the leftover part never returns", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"])
      ]
    };

    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("keeps the selected leftover part and returning part on tonight's first leftover return", () => {
    const song = leftoverThenReturn();
    expect(firstLeftoverReturn(song, "keys-right")).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverReturn(song, "bass-guitar")).toEqual({
      sectionLabel: "bridge",
      leftoverSectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftoverReturn(song, "missing-role")).toBeNull();
  });

  it("does not treat a leftover sit-out without a later return as a leftover return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    expect(
      firstLeftoverReturn({
        ...seed,
        sections: [
          sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["bass-guitar", "keys-right"]),
          sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, ["keys-right"])
        ]
      })
    ).toBeNull();
  });

  it("does not treat a come-in without a leftover sit-out as a leftover return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["keys-right"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, [])
      ]
    };

    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("does not treat a tutti after a full original return as a leftover return", () => {
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

    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("does not treat a new dropout after every original sit-out returns as a leftover return", () => {
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

    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("does not treat a continued sit-out with nobody returning as a leftover return", () => {
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

    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = leftoverThenReturn();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as leftover-return evidence", () => {
    const song = leftoverThenReturn();
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
    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    const song = leftoverThenReturn();
    const section = song.sections[2]!;
    const keysNode = section.partGraph.find((node) => node.role_id === "keys-right")!;
    const withoutKeys = section.partGraph.filter((node) => node.role_id !== "keys-right");
    song.sections[2] = {
      ...section,
      partGraph: [...withoutKeys, { ...keysNode, is_active: true }, { ...keysNode, is_active: false }]
    };
    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("skips blank leftover-return labels until a named return exists", () => {
    const song = leftoverThenReturn();
    song.sections[2] = {
      ...song.sections[2]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("fails closed when the later section has no named leftover role", () => {
    const song = leftoverThenReturn();
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("fails closed when a later section has no named graph", () => {
    const song = leftoverThenReturn();
    song.sections[2] = {
      ...song.sections[2]!,
      partGraph: []
    };
    expect(firstLeftoverReturn(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstLeftoverReturn(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = leftoverThenReturn();
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
    expect(firstLeftoverReturn(song)).toBeNull();
  });
});

describe("leftover-return copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy(
        "{leftoverRoleName} comes back at {sectionLabel} after staying out of {leftoverSectionLabel}.",
        {
          leftoverRoleName: "Keyboard 1 Right Hand {sectionLabel}",
          sectionLabel: "bridge",
          leftoverSectionLabel: "chorus"
        }
      )
    ).toBe(
      "Keyboard 1 Right Hand {sectionLabel} comes back at bridge after staying out of chorus."
    );
  });
});
