import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstTutti } from "./firstTutti";

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

function withReducedThenTutti(
  song: RehearsalSong,
  sittingRoleId: string,
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
              if (node.role_id !== sittingRoleId) {
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

describe("firstTutti", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstTutti(createDemoRehearsalSong())).toBeNull();
    expect(firstTutti(withChorus(createDemoRehearsalSong()))).toBeNull();
  });

  it("names the first full-band hit from existing part-graph evidence", () => {
    expect(firstTutti(withReducedThenTutti(createDemoRehearsalSong(), "keys-right"))).toEqual({
      sectionLabel: "chorus",
      fromSectionLabel: "verse"
    });
  });

  it("skips blank tutti labels until a named full-band hit exists", () => {
    const song = withReducedThenTutti(createDemoRehearsalSong(), "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstTutti(song)).toBeNull();
  });

  it("keeps the selected active part on tonight's first tutti", () => {
    const song = withReducedThenTutti(createDemoRehearsalSong(), "lead-vocal");
    expect(firstTutti(song, "lead-vocal")).toEqual({
      sectionLabel: "chorus",
      fromSectionLabel: "verse"
    });
    expect(firstTutti(song, "missing-role")).toBeNull();
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
    expect(firstTutti(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as a reduction", () => {
    expect(firstTutti(withReducedThenTutti(createDemoRehearsalSong(), "keys-right", "omit"))).toBeNull();
  });

  it("does not treat the song's opening full-band entrance as a tutti", () => {
    expect(firstTutti(withReducedThenTutti(createDemoRehearsalSong(), "keys-right", true))).toBeNull();
  });

  it("fails closed when the tutti section has only one named active part", () => {
    const song = withReducedThenTutti(createDemoRehearsalSong(), "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      partGraph: song.sections[1]!.partGraph.filter((node) => node.role_id === "lead-vocal")
    };
    expect(firstTutti(song)).toBeNull();
  });

  it("fails closed when the tutti section still has a sit-out", () => {
    const song = withReducedThenTutti(createDemoRehearsalSong(), "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      partGraph: song.sections[1]!.partGraph.map((node) =>
        node.role_id === "bass-guitar" ? { ...node, is_active: false } : node
      )
    };
    expect(firstTutti(song)).toBeNull();
  });

  it("fails closed when the tutti section has no named role for an active node", () => {
    const song = withReducedThenTutti(createDemoRehearsalSong(), "keys-right");
    song.sections[1] = {
      ...song.sections[1]!,
      roles: song.sections[1]!.roles.map((role) => ({ ...role, name: "   " }))
    };
    expect(firstTutti(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstTutti(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("tutti copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy("{sectionLabel} after {fromSectionLabel}.", {
        sectionLabel: "chorus {fromSectionLabel}",
        fromSectionLabel: "verse"
      })
    ).toBe("chorus {fromSectionLabel} after verse.");
  });
});
