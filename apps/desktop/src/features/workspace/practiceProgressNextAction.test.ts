import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { admitPracticeProgress, practiceProgressNextAction } from "./practiceProgressNextAction";

/** Documented. */
function withProgress(song: RehearsalSong, progressByRoleId: Record<string, number>): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) =>
        Object.prototype.hasOwnProperty.call(progressByRoleId, role.id)
          ? { ...role, practiceProgress: progressByRoleId[role.id] }
          : role
      )
    }))
  };
}

describe("admitPracticeProgress", () => {
  it("treats missing progress as not started", () => {
    expect(admitPracticeProgress({ id: "bass-guitar", name: "Bass Guitar" })).toBe(0);
  });

  it("treats an explicit undefined optional progress mark as not started", () => {
    expect(admitPracticeProgress({ practiceProgress: undefined })).toBe(0);
  });

  it("admits a finite percentage in 0–100", () => {
    expect(admitPracticeProgress({ practiceProgress: 0 })).toBe(0);
    expect(admitPracticeProgress({ practiceProgress: 50 })).toBe(50);
    expect(admitPracticeProgress({ practiceProgress: 100 })).toBe(100);
  });

  it("fails closed on inherited, non-finite, or out-of-range progress", () => {
    const inherited = Object.create({ practiceProgress: 40 }) as Record<string, unknown>;
    expect(admitPracticeProgress(inherited)).toBe(0);
    expect(admitPracticeProgress({ practiceProgress: Number.NaN })).toBeNull();
    expect(admitPracticeProgress({ practiceProgress: Number.POSITIVE_INFINITY })).toBeNull();
    expect(admitPracticeProgress({ practiceProgress: -1 })).toBeNull();
    expect(admitPracticeProgress({ practiceProgress: 101 })).toBeNull();
    expect(admitPracticeProgress({ practiceProgress: "50" })).toBeNull();
  });
});

describe("practiceProgressNextAction", () => {
  it("names the start step when the selected part has not been marked started", () => {
    const action = practiceProgressNextAction(createDemoRehearsalSong(), "bass-guitar");

    expect(action).toEqual({
      kind: "start",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      progress: 0
    });
  });

  it("keeps an explicitly undefined optional mark on the selected start path", () => {
    const song = createDemoRehearsalSong();
    Object.defineProperty(song.sections[0]!.roles[0]!, "practiceProgress", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: undefined
    });

    expect(practiceProgressNextAction(song, "bass-guitar")).toEqual({
      kind: "start",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      progress: 0
    });
  });

  it("names the continue step while the selected part is still below ready", () => {
    const song = withProgress(createDemoRehearsalSong(), { "bass-guitar": 50 });

    expect(practiceProgressNextAction(song, "bass-guitar")).toEqual({
      kind: "continue",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      progress: 50
    });
  });

  it("names the next unready part after the selected part is marked ready", () => {
    const song = withProgress(createDemoRehearsalSong(), { "bass-guitar": 100 });

    expect(practiceProgressNextAction(song, "bass-guitar")).toEqual({
      kind: "ready-next",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      progress: 100,
      nextRoleId: "keys-right",
      nextRoleName: "Keyboard 1 Right Hand"
    });
  });

  it("names the cue-sheet send when every named part is marked ready", () => {
    const song = withProgress(createDemoRehearsalSong(), {
      "bass-guitar": 100,
      "keys-right": 100,
      "lead-vocal": 100
    });

    expect(practiceProgressNextAction(song, "bass-guitar")).toEqual({
      kind: "ready-done",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      progress: 100
    });
  });

  it("skips later ready parts until the next unready named part", () => {
    const song = withProgress(createDemoRehearsalSong(), {
      "bass-guitar": 100,
      "keys-right": 100
    });

    expect(practiceProgressNextAction(song, "bass-guitar")).toEqual({
      kind: "ready-next",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      progress: 100,
      nextRoleId: "lead-vocal",
      nextRoleName: "Lead Vocal"
    });
  });

  it("fails closed without a selected part, unknown part, or malformed root", () => {
    expect(practiceProgressNextAction(createDemoRehearsalSong(), null)).toBeNull();
    expect(practiceProgressNextAction(createDemoRehearsalSong(), "missing-role")).toBeNull();
    expect(practiceProgressNextAction(null, "bass-guitar")).toBeNull();
    expect(practiceProgressNextAction({ title: "Late Night Set" }, "bass-guitar")).toBeNull();
  });

  it("fails closed when section copies disagree or progress is corrupt", () => {
    const conflicting = createDemoRehearsalSong();
    conflicting.sections = [
      {
        ...conflicting.sections[0]!,
        id: "verse-1",
        roles: conflicting.sections[0]!.roles.map((role) =>
          role.id === "bass-guitar" ? { ...role, practiceProgress: 100 } : role
        )
      },
      {
        ...conflicting.sections[0]!,
        id: "chorus-1",
        roles: conflicting.sections[0]!.roles.map((role) =>
          role.id === "bass-guitar" ? { ...role, practiceProgress: 40 } : role
        )
      }
    ];
    expect(practiceProgressNextAction(conflicting, "bass-guitar")).toBeNull();

    const corrupt = withProgress(createDemoRehearsalSong(), { "bass-guitar": 50 });
    (corrupt.sections[0]!.roles[0] as { practiceProgress: unknown }).practiceProgress = "ready";
    expect(practiceProgressNextAction(corrupt, "bass-guitar")).toBeNull();
  });

  it("fails closed when a role is unnamed or duplicated in one section", () => {
    const unnamed = createDemoRehearsalSong();
    unnamed.sections[0]!.roles[0] = { ...unnamed.sections[0]!.roles[0]!, name: "   " };
    expect(practiceProgressNextAction(unnamed, "bass-guitar")).toBeNull();

    const duplicated = createDemoRehearsalSong();
    duplicated.sections[0]!.roles.push({ ...duplicated.sections[0]!.roles[0]! });
    expect(practiceProgressNextAction(duplicated, "bass-guitar")).toBeNull();
  });
});
