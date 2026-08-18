import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatEntranceTime, resolveFirstEntrance } from "./firstEntrance";

describe("resolveFirstEntrance", () => {
  it("picks the earliest section and its highest-priority role", () => {
    const song = createDemoRehearsalSong();
    const entrance = resolveFirstEntrance(song);

    expect(entrance?.section.id).toBe("verse-1");
    expect(entrance?.role.id).toBe("bass-guitar");
    expect(entrance?.startSeconds).toBe(10);
    expect(formatEntranceTime(entrance?.startSeconds ?? -1)).toBe("0:10");
    expect(formatEntranceTime(Number.NaN)).toBe("0:00");
  });

  it("returns null when no section has a part to hear", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    expect(resolveFirstEntrance(song)).toBeNull();
  });

  it("skips an earlier section that has no part to hear", () => {
    const song = createDemoRehearsalSong();
    song.sections[0] = { ...song.sections[0]!, roles: [] };
    expect(resolveFirstEntrance(song)).toBeNull();
  });
});
