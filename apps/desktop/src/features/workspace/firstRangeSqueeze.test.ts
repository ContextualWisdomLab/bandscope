import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy, firstRangeSqueeze, meaningfulRangeText } from "./firstRangeSqueeze";

function blankRoleRange(song: RehearsalSong): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({
        ...role,
        range: { lowestNote: "", highestNote: "" },
        overlapWarnings: []
      }))
    }))
  };
}

describe("meaningfulRangeText", () => {
  it("rejects blank, whitespace, and none sentinels", () => {
    expect(meaningfulRangeText(undefined)).toBeUndefined();
    expect(meaningfulRangeText("")).toBeUndefined();
    expect(meaningfulRangeText("   ")).toBeUndefined();
    expect(meaningfulRangeText("none")).toBeUndefined();
    expect(meaningfulRangeText("NONE")).toBeUndefined();
    expect(meaningfulRangeText(" C#2 ")).toBe("C#2");
  });
});

describe("firstRangeSqueeze", () => {
  it("prefers the first named span that also carries a clash warning", () => {
    const squeeze = firstRangeSqueeze(createDemoRehearsalSong());

    expect(squeeze).toEqual({
      sectionLabel: "verse",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      overlapWarning: "Density warning: competing with Keyboard Left Hand in low register."
    });
  });

  it("falls back to the first named span when clashes are only none sentinels", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles = song.sections[0]!.roles.map((role, index) => ({
      ...role,
      overlapWarnings: index === 0 ? [" none ", ""] : []
    }));

    expect(firstRangeSqueeze(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      overlapWarning: undefined
    });
  });

  it("skips roles whose span is blank or none until a named span exists", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      range: { lowestNote: "none", highestNote: "E3" },
      overlapWarnings: ["Density warning: competing with Keyboard Left Hand in low register."]
    };

    expect(firstRangeSqueeze(song)?.roleName).toBe("Keyboard 1 Right Hand");
  });

  it("limits the squeeze to the selected role", () => {
    const squeeze = firstRangeSqueeze(createDemoRehearsalSong(), "lead-vocal");

    expect(squeeze).toEqual({
      sectionLabel: "verse",
      roleName: "Lead Vocal",
      lowestNote: "G#3",
      highestNote: "C#5",
      overlapWarning: "Melodic overlap: competing with Keyboard 1 Right Hand."
    });
  });

  it("returns null when no selected role has both notes", () => {
    expect(firstRangeSqueeze(blankRoleRange(createDemoRehearsalSong()))).toBeNull();
    expect(firstRangeSqueeze(createDemoRehearsalSong(), "missing-role")).toBeNull();
  });
});

describe("fillRangeCopy", () => {
  it("replaces every token occurrence", () => {
    expect(
      fillRangeCopy("{roleName} in {sectionLabel} before the {sectionLabel}.", {
        roleName: "Bass Guitar",
        sectionLabel: "verse"
      })
    ).toBe("Bass Guitar in verse before the verse.");
  });
});
