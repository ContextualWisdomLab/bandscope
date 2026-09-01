import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstHandoff } from "./firstHandoff";

function withDestination(song: RehearsalSong): RehearsalSong {
  const source = song.sections[0];
  return {
    ...song,
    sections: [
      source,
      {
        ...source,
        id: "chorus-1",
        label: "chorus",
        partGraph: source.partGraph.map((node) => ({
          ...node,
          handoff_to: [],
          handoff_from: []
        }))
      }
    ]
  };
}

function withPartGraph(
  song: RehearsalSong,
  partGraph: RehearsalSong["sections"][number]["partGraph"]
): RehearsalSong {
  const readySong = withDestination(song);
  return {
    ...readySong,
    sections: readySong.sections.map((section, index) =>
      index === 0 ? { ...section, partGraph } : section
    )
  };
}

describe("firstHandoff", () => {
  it("names the first active pass from the source graph at its destination section", () => {
    expect(firstHandoff(withDestination(createDemoRehearsalSong()))).toEqual({
      sectionLabel: "chorus",
      fromRole: "Bass Guitar",
      toRole: "Lead Vocal"
    });
  });

  it("names an analysis-derived handoff at the destination section", () => {
    const song = createDemoRehearsalSong();
    const source = song.sections[0];
    const destination = {
      ...source,
      id: "chorus-1",
      label: "chorus" as const,
      partGraph: source.partGraph.map((node) => ({
        ...node,
        handoff_to: [],
        handoff_from: []
      }))
    };

    expect(firstHandoff({ ...song, sections: [source, destination] })).toEqual({
      sectionLabel: "chorus",
      fromRole: "Bass Guitar",
      toRole: "Lead Vocal"
    });
  });

  it("fails closed when a transition handoff has no valid destination section", () => {
    const song = createDemoRehearsalSong();
    const malformed = {
      ...song,
      sections: [song.sections[0], null]
    } as unknown as RehearsalSong;

    expect(firstHandoff(malformed)).toBeNull();
  });

  it("fails closed when the destination section has no meaningful label", () => {
    const song = withDestination(createDemoRehearsalSong());
    const destination = { ...song.sections[1], label: " " };

    expect(firstHandoff({ ...song, sections: [song.sections[0], destination] })).toBeNull();
  });

  it("does not invent a transition for a one-section song", () => {
    expect(firstHandoff(createDemoRehearsalSong())).toBeNull();
  });

  it("skips inactive nodes until an active named receiver exists", () => {
    const song = withPartGraph(createDemoRehearsalSong(), [
      {
        role_id: "bass-guitar",
        is_active: false,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      },
      {
        role_id: "keys-right",
        is_active: true,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      },
      {
        role_id: "lead-vocal",
        is_active: true,
        handoff_to: [],
        handoff_from: ["keys-right"]
      }
    ]);

    expect(firstHandoff(song)).toEqual({
      sectionLabel: "chorus",
      fromRole: "Keyboard 1 Right Hand",
      toRole: "Lead Vocal"
    });
  });

  it("skips blank, none, self, and unknown receivers", () => {
    const song = withPartGraph(createDemoRehearsalSong(), [
      {
        role_id: "bass-guitar",
        is_active: true,
        handoff_to: ["", "none", "bass-guitar", "missing-role", "lead-vocal"],
        handoff_from: []
      }
    ]);

    expect(firstHandoff(song)).toEqual({
      sectionLabel: "chorus",
      fromRole: "Bass Guitar",
      toRole: "Lead Vocal"
    });
  });

  it("limits the pass to the selected role as giver or receiver", () => {
    expect(firstHandoff(withDestination(createDemoRehearsalSong()), "lead-vocal")).toEqual({
      sectionLabel: "chorus",
      fromRole: "Bass Guitar",
      toRole: "Lead Vocal"
    });
  });

  it("returns null when the selected role is not on a named pass", () => {
    const song = withDestination(createDemoRehearsalSong());
    expect(firstHandoff(song, "keys-right")).toBeNull();
    expect(firstHandoff(song, "missing-role")).toBeNull();
  });

  it("skips inherited or malformed part-graph evidence", () => {
    const inherited = Object.create({
      role_id: "bass-guitar",
      is_active: true,
      handoff_to: ["lead-vocal"]
    }) as RehearsalSong["sections"][number]["partGraph"][number];
    const song = withPartGraph(createDemoRehearsalSong(), [
      inherited,
      {
        role_id: "keys-right",
        is_active: true,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      }
    ]);

    expect(firstHandoff(song)).toEqual({
      sectionLabel: "chorus",
      fromRole: "Keyboard 1 Right Hand",
      toRole: "Lead Vocal"
    });
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstHandoff(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("handoff copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy("{fromRole} hands off to {toRole} in {sectionLabel}.", {
        fromRole: "Bass {toRole}",
        toRole: "Lead Vocal",
        sectionLabel: "verse"
      })
    ).toBe("Bass {toRole} hands off to Lead Vocal in verse.");
  });
});
