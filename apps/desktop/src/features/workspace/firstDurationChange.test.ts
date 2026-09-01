import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { parseRehearsalSongWithTimingEvidence } from "../../lib/rehearsalTimingEvidence";
import {
  fillDurationCopy,
  firstDurationChange,
  isDurationChangeTarget,
  sectionDurationSeconds
} from "./firstDurationChange";

function cloneSong(song: RehearsalSong): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({ ...role }))
    }))
  };
}

function appendSection(
  song: RehearsalSong,
  label: string,
  timeRange: { start: number; end: number }
): RehearsalSong {
  const first = song.sections[0];
  return {
    ...song,
    sections: [
      ...song.sections,
      {
        ...first,
        id: `${label}-section`,
        label,
        timeRange,
        roles: first.roles.map((role) => ({ ...role, id: `${role.id}-${label}` }))
      }
    ]
  };
}

describe("sectionDurationSeconds", () => {
  it("returns the positive integer span for a valid time range", () => {
    expect(sectionDurationSeconds({ start: 10, end: 30 })).toBe(20);
    expect(sectionDurationSeconds({ start: 0, end: 1 })).toBe(1);
  });

  it("fails closed on missing, inverted, fractional, or unbounded ranges", () => {
    expect(sectionDurationSeconds(null)).toBeNull();
    expect(sectionDurationSeconds({ start: 30, end: 10 })).toBeNull();
    expect(sectionDurationSeconds({ start: 10, end: 10 })).toBeNull();
    expect(sectionDurationSeconds({ start: 10.5, end: 20 })).toBeNull();
    expect(sectionDurationSeconds({ start: -1, end: 10 })).toBeNull();
    expect(sectionDurationSeconds({ start: Number.NaN, end: 10 })).toBeNull();
  });
});

describe("firstDurationChange", () => {
  it("holds the demo song's one named length so the room does not reset the count", () => {
    expect(firstDurationChange(createDemoRehearsalSong())).toEqual({
      kind: "same",
      fromSectionId: "verse-1",
      fromSectionLabel: "verse",
      fromDuration: "20",
      toSectionId: "verse-1",
      toSectionLabel: "verse",
      toDuration: "20"
    });
  });

  it("names the first consecutive length change in form order", () => {
    const song = appendSection(
      appendSection(createDemoRehearsalSong(), "pre-chorus", { start: 30, end: 50 }),
      "chorus",
      { start: 50, end: 82 }
    );

    expect(firstDurationChange(song)).toEqual({
      kind: "change",
      fromSectionId: "pre-chorus-section",
      fromSectionLabel: "pre-chorus",
      fromDuration: "20",
      toSectionId: "chorus-section",
      toSectionLabel: "chorus",
      toDuration: "32"
    });
  });

  it("skips unlabeled or invalid-duration sections until a named pair exists", () => {
    const song = cloneSong(createDemoRehearsalSong());
    song.sections[0] = {
      ...song.sections[0]!,
      label: " ",
      timeRange: { start: 10, end: 10 }
    };
    const withChorus = appendSection(song, "chorus", { start: 30, end: 46 });
    const withBridge = appendSection(withChorus, "bridge", { start: 46, end: 78 });

    expect(firstDurationChange(withBridge)).toEqual({
      kind: "change",
      fromSectionId: "chorus-section",
      fromSectionLabel: "chorus",
      fromDuration: "16",
      toSectionId: "bridge-section",
      toSectionLabel: "bridge",
      toDuration: "32"
    });
  });

  it("fails closed instead of bridging across a named section with missing timing evidence", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "verse-a", label: "verse", timeRange: { start: 0, end: 16 } },
      {
        ...verse,
        id: "chorus-gap",
        label: "chorus",
        timeRange: null
      } as unknown as typeof verse,
      { ...verse, id: "bridge-a", label: "bridge", timeRange: { start: 16, end: 48 } }
    ];

    expect(firstDurationChange(song)).toBeNull();
  });

  it("does not present legacy migration placeholders as measured section lengths", () => {
    const legacySong = structuredClone(createDemoRehearsalSong()) as unknown as {
      sections: Array<Record<string, unknown>>;
    };
    delete legacySong.sections[0]!.timeRange;

    const parsedLegacySong = parseRehearsalSongWithTimingEvidence(legacySong);
    expect(parsedLegacySong.sections[0]?.timeRange).toEqual({ start: 0, end: 1 });
    expect(firstDurationChange(parsedLegacySong)).toBeNull();
  });

  it("keeps an explicit measured one-second section eligible for count-in guidance", () => {
    const measuredSong = structuredClone(createDemoRehearsalSong());
    measuredSong.sections[0]!.timeRange = { start: 0, end: 1 };

    expect(firstDurationChange(parseRehearsalSongWithTimingEvidence(measuredSong))).toEqual({
      kind: "same",
      fromSectionId: "verse-1",
      fromSectionLabel: "verse",
      fromDuration: "1",
      toSectionId: "verse-1",
      toSectionLabel: "verse",
      toDuration: "1"
    });
  });

  it("fails closed on malformed runtime roots and members", () => {
    expect(firstDurationChange(null as unknown as RehearsalSong)).toBeNull();
    expect(firstDurationChange({ sections: "nope" } as unknown as RehearsalSong)).toBeNull();
    expect(
      firstDurationChange({
        ...createDemoRehearsalSong(),
        sections: [null, "skip", { label: "verse" }]
      } as unknown as RehearsalSong)
    ).toBeNull();
  });

  it("fails closed when repeated section ids cannot identify one destination card", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "duplicate", timeRange: { start: 0, end: 16 } },
      { ...verse, id: "duplicate", timeRange: { start: 16, end: 48 } }
    ];

    expect(firstDurationChange(song)).toBeNull();
  });

  it("rejects a repeated section id even when one occurrence has no eligible duration evidence", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "duplicate", label: " ", timeRange: { start: 10, end: 10 } },
      { ...verse, id: "duplicate", label: "chorus", timeRange: { start: 30, end: 46 } }
    ];

    expect(firstDurationChange(song)).toBeNull();
  });

  it("validates later section ids before returning an earlier duration transition", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "verse-a", label: "verse", timeRange: { start: 0, end: 16 } },
      { ...verse, id: "chorus-a", label: "chorus", timeRange: { start: 16, end: 48 } },
      { ...verse, id: "verse-a", label: "outro", timeRange: { start: 48, end: 64 } }
    ];

    expect(firstDurationChange(song)).toBeNull();
  });
});

describe("isDurationChangeTarget", () => {
  it("marks only the arrival section identity as the next-action card", () => {
    const change: ReturnType<typeof firstDurationChange> = {
      kind: "change",
      fromSectionId: "verse-1",
      fromSectionLabel: "verse",
      fromDuration: "20",
      toSectionId: "chorus-1",
      toSectionLabel: "chorus",
      toDuration: "32"
    };

    expect(isDurationChangeTarget(change, "chorus-1")).toBe(true);
    expect(isDurationChangeTarget(change, " verse-1 ")).toBe(false);
    expect(isDurationChangeTarget(change, " ")).toBe(false);
  });

  it("uses stable section identity when repeated labels would otherwise mark multiple cards", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "verse-a", label: "verse", timeRange: { start: 0, end: 16 } },
      { ...verse, id: "verse-b", label: "verse", timeRange: { start: 16, end: 48 } }
    ];

    const change = firstDurationChange(song);
    expect(change?.kind).toBe("change");
    expect(isDurationChangeTarget(change!, "verse-a")).toBe(false);
    expect(isDurationChangeTarget(change!, "verse-b")).toBe(true);
  });
});

describe("fillDurationCopy", () => {
  it("keeps rehearsal duration values literal while filling trusted tokens", () => {
    expect(
      fillDurationCopy("Count {toDuration} before the {toSection}.", {
        toDuration: "32 {toSection}",
        toSection: "chorus"
      })
    ).toBe("Count 32 {toSection} before the chorus.");
  });
});
