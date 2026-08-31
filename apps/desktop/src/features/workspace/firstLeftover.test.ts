import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstLeftover } from "./firstLeftover";

function withChorus(song: RehearsalSong): RehearsalSong {
  const verse = song.sections[0]!;
  const chorus = {
    ...verse,
    id: "chorus-1",
    label: "chorus" as RehearsalSong["sections"][number]["label"],
    timeRange: {
      start: verse.timeRange.end,
      end: verse.timeRange.end + 20
    }
  };
  return { ...song, sections: [verse, chorus] };
}

function withPartialReturn(
  song: RehearsalSong,
  returningRoleId: string,
  leftoverRoleId: string,
  leftoverActive: boolean | "omit" = false
): RehearsalSong {
  const twoSection = withChorus(song);
  return {
    ...twoSection,
    sections: twoSection.sections.map((section, index) => ({
      ...section,
      partGraph: section.partGraph.map((node) => {
        if (index === 0) {
          if (node.role_id === returningRoleId || node.role_id === leftoverRoleId) {
            return { ...node, is_active: false };
          }
          return node;
        }
        if (node.role_id === leftoverRoleId) {
          if (leftoverActive === "omit") {
            const rest: Record<string, unknown> = {
              role_id: node.role_id,
              handoff_to: node.handoff_to,
              handoff_from: node.handoff_from
            };
            return rest as RehearsalSong["sections"][number]["partGraph"][number];
          }
          return { ...node, is_active: leftoverActive };
        }
        return node;
      })
    }))
  };
}

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

describe("firstLeftover", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstLeftover(createDemoRehearsalSong())).toBeNull();
    expect(firstLeftover(withChorus(createDemoRehearsalSong()))).toBeNull();
  });

  it("names the leftover sit-out after a partial return", () => {
    expect(
      firstLeftover(withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right"))
    ).toEqual({
      sectionLabel: "chorus",
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
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 40, ["keys-right"], true)
      ]
    };

    expect(firstLeftover(song)).toEqual({
      sectionLabel: "chorus",
      fromSectionLabel: "bridge",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("treats repeated form labels as distinct timeline sections", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      label: song.sections[0]!.label
    };

    expect(firstLeftover(song)).toEqual({
      sectionLabel: "verse",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("starts a new reduction baseline after the prior sit-outs fully return", () => {
    const seed = createDemoRehearsalSong();
    const template = seed.sections[0]!;
    const song: RehearsalSong = {
      ...seed,
      sections: [
        sectionWithInactiveRoles(template, "verse-1", "verse", 0, ["lead-vocal"]),
        sectionWithInactiveRoles(template, "chorus-1", "chorus", 20, []),
        sectionWithInactiveRoles(template, "bridge-1", "bridge", 40, ["bass-guitar", "keys-right"]),
        sectionWithInactiveRoles(template, "outro-1", "outro", 60, ["keys-right"])
      ]
    };

    expect(firstLeftover(song)).toEqual({
      sectionLabel: "outro",
      fromSectionLabel: "bridge",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("fails closed on contradictory duplicate graph identities", () => {
    for (const reverse of [false, true]) {
      const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right");
      const section = song.sections[1]!;
      const keysNode = section.partGraph.find((node) => node.role_id === "keys-right")!;
      const withoutKeys = section.partGraph.filter((node) => node.role_id !== "keys-right");
      const inactiveKeys = { ...keysNode, is_active: false };
      const activeKeys = { ...keysNode, is_active: true };
      song.sections[1] = {
        ...section,
        partGraph: [
          ...withoutKeys,
          ...(reverse ? [activeKeys, inactiveKeys] : [inactiveKeys, activeKeys])
        ]
      };

      expect(firstLeftover(song)).toBeNull();
    }
  });

  it("skips blank leftover labels until a named partial return exists", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstLeftover(song)).toBeNull();
  });

  it("keeps the selected active part on tonight's first leftover", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right");
    expect(firstLeftover(song, "keys-right")).toEqual({
      sectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftover(song, "bass-guitar")).toEqual({
      sectionLabel: "chorus",
      fromSectionLabel: "verse",
      leftoverRoleId: "keys-right",
      leftoverRoleName: "Keyboard 1 Right Hand"
    });
    expect(firstLeftover(song, "missing-role")).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = withChorus(createDemoRehearsalSong());
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstLeftover(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as a leftover", () => {
    expect(
      firstLeftover(withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right", "omit"))
    ).toBeNull();
  });

  it("does not treat a continued sit-out with nobody returning as a leftover", () => {
    const song = withChorus(createDemoRehearsalSong());
    song.sections = song.sections.map((section) => ({
      ...section,
      partGraph: section.partGraph.map((node) =>
        node.role_id === "keys-right" ? { ...node, is_active: false } : node
      )
    }));
    expect(firstLeftover(song)).toBeNull();
  });

  it("does not treat a full-band return as a leftover", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right", true);
    expect(firstLeftover(song)).toBeNull();
  });

  it("does not treat a new dropout after every original sit-out returns as a leftover", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right", true);
    song.sections[1] = {
      ...song.sections[1]!,
      partGraph: song.sections[1]!.partGraph.map((node) =>
        node.role_id === "lead-vocal" ? { ...node, is_active: false } : node
      )
    };
    expect(firstLeftover(song)).toBeNull();
  });

  it("fails closed when the later section has no named leftover role", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      roles: song.sections[1]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstLeftover(song)).toBeNull();
  });

  it("fails closed when the later section has no named graph", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      partGraph: []
    };
    expect(firstLeftover(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstLeftover(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });

  it("isolates blank role ids, non-boolean flags, and unnamed graph members", () => {
    const song = withPartialReturn(createDemoRehearsalSong(), "bass-guitar", "keys-right");
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [
        { role_id: "   ", is_active: false, handoff_to: [], handoff_from: [] },
        { role_id: "ghost", is_active: false, handoff_to: [], handoff_from: [] },
        { role_id: "keys-right", is_active: "no" as unknown as boolean, handoff_to: [], handoff_from: [] },
        ...song.sections[0]!.partGraph
      ]
    };
    const inheritedId = Object.create({ id: "keys-right", name: "Inherited Keys" });
    song.sections[0] = {
      ...song.sections[0]!,
      roles: [inheritedId as RehearsalSong["sections"][number]["roles"][number], ...song.sections[0]!.roles]
    };
    expect(
      firstLeftover({
        ...song,
        sections: [song.sections[0]!, { ...song.sections[1]!, roles: "broken" as unknown as RehearsalSong["sections"][number]["roles"] }]
      })
    ).toBeNull();
    expect(firstLeftover({ ...song, sections: [song.sections[0]!, { ...song.sections[1]!, partGraph: null }] })).toBeNull();
  });
});

describe("leftover copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy("{leftoverRoleName} stays tacet in {sectionLabel} after {fromSectionLabel}.", {
        leftoverRoleName: "Keyboard 1 Right Hand {sectionLabel}",
        sectionLabel: "chorus",
        fromSectionLabel: "verse"
      })
    ).toBe("Keyboard 1 Right Hand {sectionLabel} stays tacet in chorus after verse.");
  });
});
