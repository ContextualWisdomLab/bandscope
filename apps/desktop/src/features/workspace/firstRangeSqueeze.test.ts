import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy, firstRangeRoadmap, firstRangeSqueeze, firstRangeTimeline, formatRangeClock, meaningfulRangeText, playableRange } from "./firstRangeSqueeze";

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
    expect(firstRangeSqueeze(createDemoRehearsalSong())).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      roleId: "bass-guitar",
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
      sectionId: "verse-1",
      sectionLabel: "verse",
      roleId: "bass-guitar",
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

    expect(firstRangeSqueeze({ ...song, sections: [malformedSection] } as unknown as RehearsalSong)).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3",
      overlapWarning: "Density warning: competing with Keyboard Left Hand in low register."
    });
  });

  it("limits the squeeze to the selected role", () => {
    expect(firstRangeSqueeze(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      roleId: "lead-vocal",
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

  it("preserves playable-range evidence while noncanonical identity disables navigation", () => {
    const spacedSection = createDemoRehearsalSong();
    spacedSection.sections[0]!.id = " verse-1 ";
    const sectionSqueeze = firstRangeSqueeze(spacedSection);
    expect(sectionSqueeze).toMatchObject({
      sectionId: " verse-1 ",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3"
    });
    expect(firstRangeTimeline(spacedSection, sectionSqueeze)).toBeNull();
    expect(firstRangeRoadmap(spacedSection, sectionSqueeze)).toBeNull();

    const spacedRole = createDemoRehearsalSong();
    spacedRole.sections[0]!.roles[0]!.id = " bass-guitar ";
    const roleSqueeze = firstRangeSqueeze(spacedRole);
    expect(roleSqueeze).toMatchObject({
      sectionId: "verse-1",
      roleId: " bass-guitar ",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3"
    });
    expect(firstRangeRoadmap(spacedRole, roleSqueeze)).toBeNull();
  });
});

describe("formatRangeClock", () => {
  it("formats finite non-negative seconds as m:ss", () => {
    expect(formatRangeClock(0)).toBe("0:00");
    expect(formatRangeClock(10)).toBe("0:10");
    expect(formatRangeClock(30)).toBe("0:30");
    expect(formatRangeClock(75)).toBe("1:15");
  });

  it("fails closed on unusable clocks", () => {
    expect(formatRangeClock(Number.NaN)).toBeNull();
    expect(formatRangeClock(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatRangeClock(-1)).toBeNull();
    expect(formatRangeClock("10")).toBeNull();
  });
});

describe("firstRangeTimeline", () => {
  it("names the unique first-range section clock", () => {
    const song = createDemoRehearsalSong();
    expect(firstRangeTimeline(song, firstRangeSqueeze(song))).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      startClock: "0:10",
      endClock: "0:30"
    });
  });

  it("allows repeated form labels when the selected section identifier remains unique", () => {
    const song = createDemoRehearsalSong();
    song.sections.push({ ...song.sections[0]!, id: "verse-2", timeRange: { start: 90, end: 110 } });

    expect(firstRangeTimeline(song, firstRangeSqueeze(song))).toEqual({
      sectionId: "verse-1",
      sectionLabel: "verse",
      startClock: "0:10",
      endClock: "0:30"
    });
  });

  it("fails closed when the squeeze is missing or the selected section identifier is duplicated", () => {
    const song = createDemoRehearsalSong();
    const duplicateId = {
      ...song,
      sections: [song.sections[0]!, { ...song.sections[0]!, label: "chorus" }]
    };
    expect(firstRangeTimeline(song, null)).toBeNull();
    expect(firstRangeTimeline(duplicateId, firstRangeSqueeze(song))).toBeNull();
  });

  it("fails closed on malformed, zero-duration, inverted, or non-finite section times", () => {
    const song = createDemoRehearsalSong();
    const squeeze = firstRangeSqueeze(song);
    song.sections[0]!.timeRange = { start: Number.NaN, end: 30 };
    expect(firstRangeTimeline(song, squeeze)).toBeNull();
    song.sections[0]!.timeRange = { start: 10, end: 10 };
    expect(firstRangeTimeline(song, squeeze)).toBeNull();
    song.sections[0]!.timeRange = { start: 30, end: 10 };
    expect(firstRangeTimeline(song, squeeze)).toBeNull();
    song.sections[0]!.id = "   ";
    song.sections[0]!.timeRange = { start: 10, end: 30 };
    expect(firstRangeTimeline(song, squeeze)).toBeNull();
  });
});

describe("firstRangeRoadmap", () => {
  it("returns the selected section and part by unique identifiers", () => {
    const song = createDemoRehearsalSong();
    expect(firstRangeRoadmap(song, firstRangeSqueeze(song))).toEqual({
      sectionId: "verse-1",
      roleId: "bass-guitar",
      sectionLabel: "verse",
      roleName: "Bass Guitar"
    });
  });

  it("allows repeated labels and names when section and role identifiers remain unique", () => {
    const song = createDemoRehearsalSong();
    song.sections.push({ ...song.sections[0]!, id: "verse-2" });
    song.sections[0]!.roles.push({ ...song.sections[0]!.roles[0]!, id: "bass-guitar-double" });

    expect(firstRangeRoadmap(song, firstRangeSqueeze(song))).toEqual({
      sectionId: "verse-1",
      roleId: "bass-guitar",
      sectionLabel: "verse",
      roleName: "Bass Guitar"
    });
  });

  it("fails closed when the selected section or role identifier is duplicated", () => {
    const sectionDuplicate = createDemoRehearsalSong();
    sectionDuplicate.sections.push({ ...sectionDuplicate.sections[0]!, label: "chorus" });
    expect(firstRangeRoadmap(sectionDuplicate, firstRangeSqueeze(sectionDuplicate))).toBeNull();

    const roleDuplicate = createDemoRehearsalSong();
    roleDuplicate.sections[0]!.roles.push({ ...roleDuplicate.sections[0]!.roles[0]!, name: "Bass Guitar Double" });
    expect(firstRangeRoadmap(roleDuplicate, firstRangeSqueeze(roleDuplicate))).toBeNull();
  });
});

describe("fillRangeCopy", () => {
  it("replaces every token occurrence", () => {
    expect(fillRangeCopy("{roleName} in {sectionLabel} before the {sectionLabel}.", { roleName: "Bass Guitar", sectionLabel: "verse" })).toBe("Bass Guitar in verse before the verse.");
  });

  it("keeps replacement tokens and placeholder-shaped rehearsal values literal", () => {
    expect(fillRangeCopy("{roleName} in {sectionLabel}.", { roleName: "Bass $& {sectionLabel}", sectionLabel: "verse" })).toBe("Bass $& {sectionLabel} in verse.");
  });

  it("does not satisfy tokens with inherited object members", () => {
    expect(fillRangeCopy("Check {toString} before {missingToken}.", { sectionLabel: "verse" })).toBe("Check {toString} before {missingToken}.");
  });
});
