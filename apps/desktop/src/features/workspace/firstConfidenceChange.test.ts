import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  confidenceWordKey,
  fillConfidenceCopy,
  firstConfidenceChange,
  isConfidenceChangeTarget,
  sectionConfidenceLevel
} from "./firstConfidenceChange";

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
  level: "low" | "medium" | "high"
): RehearsalSong {
  const first = song.sections[0]!;
  return {
    ...song,
    sections: [
      ...song.sections,
      {
        ...first,
        id: `${label}-section`,
        label,
        confidence: {
          ...first.confidence,
          level
        },
        roles: first.roles.map((role) => ({ ...role, id: `${role.id}-${label}` }))
      }
    ]
  };
}

describe("sectionConfidenceLevel", () => {
  it("returns a named rehearsal confidence level", () => {
    expect(sectionConfidenceLevel({ level: "low" })).toBe("low");
    expect(sectionConfidenceLevel({ level: "medium" })).toBe("medium");
    expect(sectionConfidenceLevel({ level: "high" })).toBe("high");
  });

  it("fails closed on missing, blank, or invented levels", () => {
    expect(sectionConfidenceLevel(null)).toBeNull();
    expect(sectionConfidenceLevel({ level: " " })).toBeNull();
    expect(sectionConfidenceLevel({ level: "ready" })).toBeNull();
    expect(sectionConfidenceLevel({ notes: "low" })).toBeNull();
  });
});

describe("firstConfidenceChange", () => {
  it("holds the demo song's one named confidence so the room does not invent a reset", () => {
    expect(firstConfidenceChange(createDemoRehearsalSong())).toEqual({
      kind: "same",
      fromSectionId: "verse-1",
      fromSectionLabel: "verse",
      fromLevel: "medium",
      toSectionId: "verse-1",
      toSectionLabel: "verse",
      toLevel: "medium"
    });
  });

  it("names the first consecutive confidence change in form order", () => {
    const song = appendSection(
      appendSection(createDemoRehearsalSong(), "pre-chorus", "medium"),
      "chorus",
      "low"
    );

    expect(firstConfidenceChange(song)).toEqual({
      kind: "change",
      fromSectionId: "pre-chorus-section",
      fromSectionLabel: "pre-chorus",
      fromLevel: "medium",
      toSectionId: "chorus-section",
      toSectionLabel: "chorus",
      toLevel: "low"
    });
  });

  it("skips unlabeled or invalid-confidence sections until a named pair exists", () => {
    const song = cloneSong(createDemoRehearsalSong());
    song.sections[0] = {
      ...song.sections[0]!,
      label: " ",
      confidence: { ...song.sections[0]!.confidence, level: "ready" as "low" }
    };
    const withChorus = appendSection(song, "chorus", "high");
    const withBridge = appendSection(withChorus, "bridge", "low");

    expect(firstConfidenceChange(withBridge)).toEqual({
      kind: "change",
      fromSectionId: "chorus-section",
      fromSectionLabel: "chorus",
      fromLevel: "high",
      toSectionId: "bridge-section",
      toSectionLabel: "bridge",
      toLevel: "low"
    });
  });

  it("fails closed on malformed runtime roots and members", () => {
    expect(firstConfidenceChange(null as unknown as RehearsalSong)).toBeNull();
    expect(firstConfidenceChange({ sections: "nope" } as unknown as RehearsalSong)).toBeNull();
    expect(
      firstConfidenceChange({
        ...createDemoRehearsalSong(),
        sections: [null, "skip", { label: "verse" }]
      } as unknown as RehearsalSong)
    ).toBeNull();
  });

  it("fails closed when repeated section ids cannot identify one destination card", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "duplicate", confidence: { ...verse.confidence, level: "medium" } },
      { ...verse, id: "duplicate", confidence: { ...verse.confidence, level: "low" } }
    ];

    expect(firstConfidenceChange(song)).toBeNull();
  });

  it("rejects a repeated section id even when one occurrence has no eligible confidence evidence", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "duplicate", label: " ", confidence: { ...verse.confidence, level: "ready" as "low" } },
      { ...verse, id: "duplicate", label: "chorus", confidence: { ...verse.confidence, level: "low" } }
    ];

    expect(firstConfidenceChange(song)).toBeNull();
  });

  it("validates later section ids before returning an earlier confidence transition", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "verse-a", label: "verse", confidence: { ...verse.confidence, level: "medium" } },
      { ...verse, id: "chorus-a", label: "chorus", confidence: { ...verse.confidence, level: "low" } },
      { ...verse, id: "verse-a", label: "outro", confidence: { ...verse.confidence, level: "high" } }
    ];

    expect(firstConfidenceChange(song)).toBeNull();
  });
});

describe("isConfidenceChangeTarget", () => {
  it("marks only the arrival section identity as the next-action card", () => {
    const change: ReturnType<typeof firstConfidenceChange> = {
      kind: "change",
      fromSectionId: "verse-1",
      fromSectionLabel: "verse",
      fromLevel: "medium",
      toSectionId: "chorus-1",
      toSectionLabel: "chorus",
      toLevel: "low"
    };

    expect(isConfidenceChangeTarget(change, "chorus-1")).toBe(true);
    expect(isConfidenceChangeTarget(change, " verse-1 ")).toBe(false);
    expect(isConfidenceChangeTarget(change, " ")).toBe(false);
  });

  it("uses stable section identity when repeated labels would otherwise mark multiple cards", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections = [
      { ...verse, id: "verse-a", label: "verse", confidence: { ...verse.confidence, level: "medium" } },
      { ...verse, id: "verse-b", label: "verse", confidence: { ...verse.confidence, level: "low" } }
    ];

    const change = firstConfidenceChange(song);
    expect(change?.kind).toBe("change");
    expect(isConfidenceChangeTarget(change!, "verse-a")).toBe(false);
    expect(isConfidenceChangeTarget(change!, "verse-b")).toBe(true);
  });
});

describe("fillConfidenceCopy", () => {
  it("keeps rehearsal confidence values literal while filling trusted tokens", () => {
    expect(
      fillConfidenceCopy("Confirm {toLevel} before the {toSection}.", {
        toLevel: "low {toSection}",
        toSection: "chorus"
      })
    ).toBe("Confirm low {toSection} before the chorus.");
  });
});

describe("confidenceWordKey", () => {
  it("maps each named level onto its i18n word key", () => {
    expect(confidenceWordKey("low")).toBe("confidenceWordLow");
    expect(confidenceWordKey("medium")).toBe("confidenceWordMedium");
    expect(confidenceWordKey("high")).toBe("confidenceWordHigh");
  });
});
