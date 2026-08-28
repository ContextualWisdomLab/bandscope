import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy, firstRangeSqueeze, meaningfulRangeText, playableRange } from "./firstRangeSqueeze";

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

describe("playableRange", () => {
  it("returns the trimmed ordered span for a valid scientific-pitch range", () => {
    expect(playableRange(" C#2 ", "E3")).toEqual({ lowestNote: "C#2", highestNote: "E3" });
    expect(playableRange("E3", "E3")).toEqual({ lowestNote: "E3", highestNote: "E3" });
  });

  it("fails closed on blank, none, non-pitch, or inverted spans", () => {
    for (const [lowestNote, highestNote] of [
      ["", ""],
      ["none", "E3"],
      ["not-a-note", "E3"],
      ["E3", "not-a-note"],
      ["E3", "C#2"]
    ]) {
      expect(playableRange(lowestNote, highestNote)).toBeNull();
    }
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

  it("rejects malformed and inverted spans instead of calling them playable", () => {
    for (const range of [
      { lowestNote: "not-a-note", highestNote: "E3" },
      { lowestNote: "E3", highestNote: "C#2" }
    ]) {
      const song = createDemoRehearsalSong();
      const selectedRole = song.sections[0]!.roles[0]!;
      selectedRole.range = range;

      expect(firstRangeSqueeze(song, selectedRole.id)).toBeNull();
    }
  });

  it("fails closed on malformed runtime roots and collections", () => {
    for (const malformed of [null, {}, { sections: null }, { sections: [null] }]) {
      expect(firstRangeSqueeze(malformed as unknown as RehearsalSong)).toBeNull();
    }

    const song = createDemoRehearsalSong();
    const validRole = song.sections[0]!.roles[0]!;
    const malformedSection = {
      ...song.sections[0],
      roles: [null, { ...validRole, range: null }, validRole]
    };

    expect(
      firstRangeSqueeze({ ...song, sections: [malformedSection] } as unknown as RehearsalSong)
    ).toEqual({
      sectionLabel: "verse",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      overlapWarning: "Density warning: competing with Keyboard Left Hand in low register."
    });
  });

  it("fails closed when runtime metadata supplies an unsupported section label", () => {
    const song = createDemoRehearsalSong();
    for (const section of song.sections) {
      (section as unknown as { label: string }).label = "custom-section";
    }

    expect(firstRangeSqueeze(song)).toBeNull();
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

  it("keeps replacement tokens and placeholder-shaped rehearsal values literal", () => {
    expect(
      fillRangeCopy("{roleName} in {sectionLabel}.", {
        roleName: "Bass $& {sectionLabel}",
        sectionLabel: "verse"
      })
    ).toBe("Bass $& {sectionLabel} in verse.");
  });

  it("does not satisfy tokens with inherited object members", () => {
    expect(
      fillRangeCopy("Check {toString} before {missingToken}.", { sectionLabel: "verse" })
    ).toBe("Check {toString} before {missingToken}.");
  });
});
