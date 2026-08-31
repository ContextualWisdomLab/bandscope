import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstTacet } from "./firstTacet";

function withSitOut(
  song: RehearsalSong,
  roleId: string,
  isActive: boolean | "omit" = false
): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section, index) =>
      index === 0
        ? {
            ...section,
            partGraph: section.partGraph.map((node) => {
              if (node.role_id !== roleId) {
                return node;
              }
              if (isActive === "omit") {
                const rest: Record<string, unknown> = {
                  role_id: node.role_id,
                  handoff_to: node.handoff_to,
                  handoff_from: node.handoff_from
                };
                return rest as RehearsalSong["sections"][number]["partGraph"][number];
              }
              return { ...node, is_active: isActive };
            })
          }
        : section
    )
  };
}

function withFollowingSection(song: RehearsalSong): RehearsalSong {
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

describe("firstTacet", () => {
  it("returns null on the demo song where every graph node is active", () => {
    expect(firstTacet(createDemoRehearsalSong())).toBeNull();
  });

  it("names the first explicit sit-out from existing part-graph evidence", () => {
    expect(firstTacet(withSitOut(createDemoRehearsalSong(), "keys-right"))).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand"
    });
  });

  it("uses song-wide role metadata when production omits an inactive role from the section", () => {
    const song = withSitOut(withFollowingSection(createDemoRehearsalSong()), "keys-right");
    song.sections[0] = {
      ...song.sections[0]!,
      roles: song.sections[0]!.roles.filter((role) => role.id !== "keys-right")
    };

    expect(firstTacet(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand"
    });
  });

  it("skips blank labels until a named sit-out exists", () => {
    const song = withSitOut(createDemoRehearsalSong(), "keys-right");
    song.sections[0] = {
      ...song.sections[0]!,
      label: "none" as RehearsalSong["sections"][number]["label"]
    };
    expect(firstTacet(song)).toBeNull();
  });

  it("keeps the selected active part on tonight's first tacet", () => {
    const song = withSitOut(createDemoRehearsalSong(), "lead-vocal");
    expect(firstTacet(song, "lead-vocal")).toEqual({
      sectionLabel: "verse",
      roleName: "Lead Vocal"
    });
    expect(firstTacet(song, "bass-guitar")).toBeNull();
  });

  it("ignores inherited is_active evidence", () => {
    const song = createDemoRehearsalSong();
    const inherited = Object.create({
      is_active: false,
      role_id: "keys-right"
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: [inherited, ...song.sections[0]!.partGraph]
    };
    expect(firstTacet(song)).toBeNull();
  });

  it("does not treat a missing is_active flag as a sit-out", () => {
    expect(firstTacet(withSitOut(createDemoRehearsalSong(), "keys-right", "omit"))).toBeNull();
  });

  it("rejects inherited roles as display-name authority", () => {
    const song = withSitOut(createDemoRehearsalSong(), "keys-right");
    const section = song.sections[0]!;
    const inherited = Object.assign(Object.create({ roles: section.roles }), {
      id: section.id,
      label: section.label,
      confidence: section.confidence,
      timeRange: section.timeRange,
      chords: section.chords,
      roles: undefined,
      cues: section.cues,
      partGraph: section.partGraph,
      practice_progress: section.practice_progress
    });
    delete inherited.roles;
    song.sections[0] = inherited as RehearsalSong["sections"][number];

    expect(firstTacet(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstTacet(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("tacet copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy("{roleName} sits out of {sectionLabel}.", {
        roleName: "Bass {sectionLabel}",
        sectionLabel: "verse"
      })
    ).toBe("Bass {sectionLabel} sits out of verse.");
  });
});