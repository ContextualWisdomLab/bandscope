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

  it("skips malformed marks and duplicate role ids", () => {
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
