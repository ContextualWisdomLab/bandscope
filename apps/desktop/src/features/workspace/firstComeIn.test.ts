import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstComeIn } from "./firstComeIn";

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

function withSitOutThenComeIn(
  song: RehearsalSong,
  roleId: string,
  sitOutActive: boolean | "omit" = false
): RehearsalSong {
  const twoSection = withChorus(song);
  return {
    ...twoSection,
    sections: twoSection.sections.map((section, index) =>
      index === 0
        ? {
            ...section,
            partGraph: section.partGraph.map((node) => {
              if (node.role_id !== roleId) {
                return node;
              }
              if (sitOutActive === "omit") {
                const rest: Record<string, unknown> = {
                  role_id: node.role_id,
                  handoff_to: node.handoff_to,
                  handoff_from: node.handoff_from
                };
                return rest as RehearsalSong["sections"][number]["partGraph"][number];
              }
              return { ...node, is_active: sitOutActive };
            })
          }
        : section
    )
  };
}

describe("firstComeIn", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstComeIn(createDemoRehearsalSong())).toBeNull();
    expect(firstComeIn(withChorus(createDemoRehearsalSong()))).toBeNull();
  });

  it("names the first explicit return from existing part-graph evidence", () => {
    expect(firstComeIn(withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right"))).toEqual({
      sectionLabel: "chorus",
      roleName: "Keyboard 1 Right Hand",
      fromSectionLabel: "verse"
    });
  });

  it("keeps the first return when a later section repeats the sit-out label", () => {
    const song = withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right");
    const repeatedVerse = {
      ...song.sections[1]!,
      id: "verse-2",
      label: "verse" as RehearsalSong["sections"][number]["label"]
    };
    const laterChorus = {
      ...song.sections[1]!,
      id: "chorus-2",
      timeRange: {
        start: song.sections[1]!.timeRange.end,
        end: song.sections[1]!.timeRange.end + 20
      }
    };
    song.sections = [song.sections[0]!, repeatedVerse, laterChorus];

    expect(firstComeIn(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand",
      fromSectionLabel: "verse"
    });
  });

  it("skips blank come-in labels until a named return exists", () => {
    const song = withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstComeIn(song)).toBeNull();
  });

  it("keeps the selected active part on tonight's first come-in", () => {
    const song = withSitOutThenComeIn(createDemoRehearsalSong(), "lead-vocal");
    expect(firstComeIn(song, "lead-vocal")).toEqual({
      sectionLabel: "chorus",
      roleName: "Lead Vocal",
      fromSectionLabel: "verse"
    });
    expect(firstComeIn(song, "bass-guitar")).toBeNull();
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
    expect(firstComeIn(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as a sit-out", () => {
    expect(firstComeIn(withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right", "omit"))).toBeNull();
  });

  it("does not treat the song's opening entrance as a come-in", () => {
    expect(firstComeIn(withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right", true))).toBeNull();
  });

  it("fails closed when the return section has no named role", () => {
    const song = withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      roles: song.sections[1]!.roles.map((role) =>
        role.id === "keys-right" ? { ...role, name: "   " } : role
      )
    };
    expect(firstComeIn(song)).toBeNull();
  });

  it("rejects inherited return-section roles as naming authority", () => {
    const song = withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right");
    const returnSection = song.sections[1]!;
    const returnWithoutOwnRoles = { ...returnSection } as Record<string, unknown>;
    delete returnWithoutOwnRoles.roles;
    song.sections[1] = Object.assign(
      Object.create({ roles: returnSection.roles }),
      returnWithoutOwnRoles
    ) as RehearsalSong["sections"][number];

    expect(firstComeIn(song)).toBeNull();
  });

  it("fails closed when the first active return has no trustworthy role name", () => {
    const song = withSitOutThenComeIn(createDemoRehearsalSong(), "keys-right");
    const chorus = song.sections[1]!;
    const unnamedChorus = {
      ...chorus,
      roles: chorus.roles.map((role) =>
        role.id === "keys-right" ? { ...role, name: "   " } : role
      )
    };
    const bridge = {
      ...chorus,
      id: "bridge-1",
      label: "bridge" as RehearsalSong["sections"][number]["label"],
      timeRange: {
        start: chorus.timeRange.end,
        end: chorus.timeRange.end + 20
      }
    };
    song.sections = [song.sections[0]!, unnamedChorus, bridge];

    expect(firstComeIn(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstComeIn(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("come-in copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy("{roleName} comes in on {sectionLabel} after {fromSectionLabel}.", {
        roleName: "Bass {sectionLabel}",
        sectionLabel: "chorus",
        fromSectionLabel: "verse"
      })
    ).toBe("Bass {sectionLabel} comes in on chorus after verse.");
  });
});