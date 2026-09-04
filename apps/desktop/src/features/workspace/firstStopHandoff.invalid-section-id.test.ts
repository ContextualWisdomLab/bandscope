import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

function malformedStop(sectionId: unknown) {
  const song = createDemoRehearsalSong();
  const stop = structuredClone(song.sections[0]!);
  stop.id = sectionId as string;
  stop.label = "stop";
  stop.timeRange = { start: 18, end: 19 };
  song.sections = [stop];
  return song;
}

describe("resolveFirstStopHandoff runtime section identity", () => {
  it("rejects stop sections whose runtime id is not a non-empty string", () => {
    for (const invalidId of [42, " "]) {
      const song = malformedStop(invalidId);

      expect(() => resolveFirstStopHandoff(song)).not.toThrow();
      expect(resolveFirstStopHandoff(song)).toBeNull();
    }
  });
});
