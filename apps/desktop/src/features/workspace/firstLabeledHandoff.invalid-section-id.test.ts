import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

function malformedHandoff(sectionId: unknown) {
  const song = createDemoRehearsalSong();
  const handoff = structuredClone(song.sections[0]!);
  handoff.id = sectionId as string;
  handoff.label = "handoff";
  handoff.timeRange = { start: 22, end: 24 };
  song.sections = [handoff];
  return song;
}

describe("resolveFirstLabeledHandoff runtime section identity", () => {
  it("rejects handoff sections whose runtime id is not a non-empty string", () => {
    for (const invalidId of [42, " "]) {
      const song = malformedHandoff(invalidId);

      expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
      expect(resolveFirstLabeledHandoff(song)).toBeNull();
    }
  });
});
