import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstHandoff } from "./firstHandoff";

function withPartGraph(
  song: RehearsalSong,
  partGraph: RehearsalSong["sections"][number]["partGraph"]
): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section, index) =>
      index === 0 ? { ...section, partGraph } : section
    )
  };
}

describe("firstHandoff", () => {
  it("names the first active pass from the existing part graph", () => {
    expect(firstHandoff(createDemoRehearsalSong())).toEqual({
      sectionLabel: "verse",
      fromRole: "Bass Guitar",
      toRole: "Lead Vocal"
    });
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
      sectionLabel: "verse",
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
      sectionLabel: "verse",
      fromRole: "Bass Guitar",
      toRole: "Lead Vocal"
    });
  });

  it("limits the pass to the selected role as giver or receiver", () => {
    expect(firstHandoff(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      sectionLabel: "verse",
      fromRole: "Bass Guitar",
      toRole: "Lead Vocal"
    });
  });

  it("returns null when the selected role is not on a named pass", () => {
    expect(firstHandoff(createDemoRehearsalSong(), "keys-right")).toBeNull();
    expect(firstHandoff(createDemoRehearsalSong(), "missing-role")).toBeNull();
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
      sectionLabel: "verse",
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
