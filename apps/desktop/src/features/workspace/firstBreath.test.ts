import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { fillRangeCopy } from "./firstRangeSqueeze";
import { firstBreath, formatBreathTime } from "./firstBreath";

function withSectionTime(
  song: RehearsalSong,
  timeRange: RehearsalSong["sections"][number]["timeRange"],
  label: string = song.sections[0]!.label
): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section, index) =>
      index === 0
        ? { ...section, label: label as RehearsalSong["sections"][number]["label"], timeRange }
        : section
    )
  };
}

describe("formatBreathTime", () => {
  it("formats bounded whole seconds as m:ss", () => {
    expect(formatBreathTime(0)).toBe("0:00");
    expect(formatBreathTime(30)).toBe("0:30");
    expect(formatBreathTime(30.9)).toBe("0:30");
    expect(formatBreathTime(90)).toBe("1:30");
  });

  it("fails closed on non-finite, negative, non-number, or oversized ends", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, "30", 4_294_967_296]) {
      expect(formatBreathTime(value)).toBeNull();
    }
  });
});

describe("firstBreath", () => {
  it("names the first last-line breath from existing time-range evidence", () => {
    expect(firstBreath(createDemoRehearsalSong())).toEqual({
      sectionLabel: "verse",
      endTime: "0:30"
    });
  });

  it("skips blank labels until a named section end exists", () => {
    const song = withSectionTime(createDemoRehearsalSong(), { start: 10, end: 30 }, "none");
    expect(firstBreath(song)).toBeNull();
  });

  it("skips inverted, inherited, or malformed time ranges", () => {
    const inherited = Object.create({ start: 10, end: 30 }) as RehearsalSong["sections"][number]["timeRange"];
    expect(firstBreath(withSectionTime(createDemoRehearsalSong(), { start: 30, end: 10 }))).toBeNull();
    expect(firstBreath(withSectionTime(createDemoRehearsalSong(), inherited))).toBeNull();
    expect(
      firstBreath(withSectionTime(createDemoRehearsalSong(), { start: Number.NaN, end: 30 }))
    ).toBeNull();
  });

  it("keeps the selected active part on tonight's first breath", () => {
    expect(firstBreath(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      sectionLabel: "verse",
      endTime: "0:30"
    });
  });

  it("returns null when the selected part sits out of the only named end", () => {
    const song = createDemoRehearsalSong();
    song.sections[0] = {
      ...song.sections[0]!,
      partGraph: song.sections[0]!.partGraph.map((node) =>
        node.role_id === "keys-right" ? { ...node, is_active: false } : node
      )
    };

    expect(firstBreath(song, "keys-right")).toBeNull();
    expect(firstBreath(song, "missing-role")).toBeNull();
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { sections: {} }, { sections: [null] }]) {
      expect(firstBreath(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("breath copy filling", () => {
  it("keeps rehearsal values literal", () => {
    expect(
      fillRangeCopy("{sectionLabel} ends at {endTime}.", {
        sectionLabel: "verse {endTime}",
        endTime: "0:30"
      })
    ).toBe("verse {endTime} ends at 0:30.");
  });
});
