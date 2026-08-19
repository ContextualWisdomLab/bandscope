import {
  MAX_SECTION_TIME_SECONDS,
  createDemoRehearsalSong,
  type RehearsalSection
} from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

/** Build one otherwise-valid labeled pickup with a caller-supplied runtime window. */
function songWithPickupWindow(start: number, end: number) {
  const song = createDemoRehearsalSong();
  const section = song.sections[0]!;
  section.label = "pickup";
  section.timeRange = { start, end } as RehearsalSection["timeRange"];
  song.sections = [section];
  return song;
}

describe("resolveFirstPickupHandoff time-range contract", () => {
  it("rejects fractional pickup windows", () => {
    expect(resolveFirstPickupHandoff(songWithPickupWindow(10.5, 11.5))).toBeNull();
  });

  it("rejects zero-duration pickup windows", () => {
    expect(resolveFirstPickupHandoff(songWithPickupWindow(10, 10))).toBeNull();
  });

  it("rejects pickup windows beyond the shared section-time ceiling", () => {
    expect(
      resolveFirstPickupHandoff(songWithPickupWindow(10, MAX_SECTION_TIME_SECONDS + 1))
    ).toBeNull();
  });
});
