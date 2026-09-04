import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { practiceProgressNextAction } from "./practiceProgressNextAction";

/** Return a copy with one role's range removed everywhere it appears. */
function withoutPlayableRange(song: RehearsalSong, roleId: string): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) =>
        role.id === roleId
          ? { ...role, range: { lowestNote: "", highestNote: "" } }
          : role
      )
    }))
  };
}

/** Return a copy with an admitted practice percentage for one role. */
function withProgress(song: RehearsalSong, roleId: string, progress: number): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) =>
        role.id === roleId ? { ...role, practiceProgress: progress } : role
      )
    }))
  };
}

describe("practiceProgressNextAction playable-range admission", () => {
  it("does not tell an unstarted selected part to check a range that is unavailable", () => {
    const song = withoutPlayableRange(createDemoRehearsalSong(), "bass-guitar");

    expect(practiceProgressNextAction(song, "bass-guitar")).toBeNull();
  });

  it("does not route a ready part to an unready next part whose playable range is unavailable", () => {
    let song = withProgress(createDemoRehearsalSong(), "bass-guitar", 100);
    song = withoutPlayableRange(song, "keys-right");

    expect(practiceProgressNextAction(song, "bass-guitar")).toBeNull();
  });

  it("keeps the range-independent continue action for an already-started part", () => {
    let song = withProgress(createDemoRehearsalSong(), "bass-guitar", 50);
    song = withoutPlayableRange(song, "bass-guitar");

    expect(practiceProgressNextAction(song, "bass-guitar")).toEqual({
      kind: "continue",
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      progress: 50
    });
  });
});
