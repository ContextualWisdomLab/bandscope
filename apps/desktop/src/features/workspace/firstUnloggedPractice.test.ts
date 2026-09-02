import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillUnloggedPracticeCopy,
  firstUnloggedPractice,
  hasLoggedPracticeProgress
} from "./firstUnloggedPractice";

describe("hasLoggedPracticeProgress", () => {
  it("admits only 0–100 integers", () => {
    expect(hasLoggedPracticeProgress(0)).toBe(true);
    expect(hasLoggedPracticeProgress(100)).toBe(true);
    expect(hasLoggedPracticeProgress(40)).toBe(true);
    expect(hasLoggedPracticeProgress(undefined)).toBe(false);
    expect(hasLoggedPracticeProgress(40.5)).toBe(false);
    expect(hasLoggedPracticeProgress(-1)).toBe(false);
    expect(hasLoggedPracticeProgress(101)).toBe(false);
    expect(hasLoggedPracticeProgress("40")).toBe(false);
  });
});

describe("firstUnloggedPractice", () => {
  it("names the first demo part that still has no practice mark", () => {
    expect(firstUnloggedPractice(createDemoRehearsalSong())).toEqual({
      sectionLabel: "verse",
      roleName: "Bass Guitar"
    });
  });

  it("skips parts that already own a 0–100 mark", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      practiceProgress: 40
    };

    expect(firstUnloggedPractice(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Keyboard 1 Right Hand"
    });
  });

  it("limits the callout to the selected unlogged part", () => {
    expect(firstUnloggedPractice(createDemoRehearsalSong(), "lead-vocal")).toEqual({
      sectionLabel: "verse",
      roleName: "Lead Vocal"
    });
  });

  it("returns null when the selected part already has a mark", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[2] = {
      ...song.sections[0]!.roles[2]!,
      practiceProgress: 0
    };

    expect(firstUnloggedPractice(song, "lead-vocal")).toBeNull();
  });

  it("skips malformed marks and duplicate role ids inside one section", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      practiceProgress: 150 as unknown as number
    };
    song.sections[0]!.roles[1] = {
      ...song.sections[0]!.roles[1]!,
      id: "bass-guitar"
    };

    expect(firstUnloggedPractice(song)?.roleName).toBe("Lead Vocal");
  });

  it("treats the same named role across sections as one part", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections.push({
      ...structuredClone(verse),
      id: "chorus-1",
      label: "chorus",
      timeRange: { start: 30, end: 50 }
    });

    expect(firstUnloggedPractice(song)).toEqual({
      sectionLabel: "verse",
      roleName: "Bass Guitar"
    });
  });

  it("fails closed when repeated section copies disagree about practice state", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 30, end: 50 };
    chorus.roles[0] = {
      ...chorus.roles[0]!,
      practiceProgress: 40
    };
    song.sections.push(chorus);

    expect(firstUnloggedPractice(song, "bass-guitar")).toBeNull();
  });

  it("rejects inherited identity and practice evidence", () => {
    const inheritedRole = Object.create({
      id: "ghost-role",
      name: "Ghost Role",
      practiceProgress: 40
    }) as Record<string, unknown>;
    const song = {
      sections: [
        {
          label: "verse",
          roles: [inheritedRole]
        }
      ]
    } as unknown as RehearsalSong;

    expect(firstUnloggedPractice(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots and collections", () => {
    for (const malformed of [null, {}, { sections: null }, { sections: [null] }]) {
      expect(firstUnloggedPractice(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("fillUnloggedPracticeCopy", () => {
  it("replaces tokens without inheriting object members", () => {
    expect(
      fillUnloggedPracticeCopy("{roleName} in {sectionLabel} before {sectionLabel}.", {
        roleName: "Bass Guitar",
        sectionLabel: "verse"
      })
    ).toBe("Bass Guitar in verse before verse.");
    expect(fillUnloggedPracticeCopy("Check {toString} before {missingToken}.", { roleName: "Bass Guitar" })).toBe(
      "Check {toString} before {missingToken}."
    );
  });
});
