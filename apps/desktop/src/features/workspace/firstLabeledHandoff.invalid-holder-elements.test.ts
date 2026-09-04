import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

function songWithHandoff() {
  const song = createDemoRehearsalSong();
  const handoff = structuredClone(song.sections[0]!);
  handoff.id = "handoff-1";
  handoff.label = "handoff";
  handoff.timeRange = { start: 22, end: 24 };
  song.sections = [handoff];
  return { song, handoff };
}

describe("resolveFirstLabeledHandoff runtime holder elements", () => {
  it("keeps the pass band-wide when runtime roles contain a non-object element", () => {
    for (const malformedRole of [null, 42]) {
      const { song, handoff } = songWithHandoff();
      handoff.roles = [malformedRole] as unknown as typeof handoff.roles;

      expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
      expect(resolveFirstLabeledHandoff(song)?.holdingRole).toBeNull();
    }
  });

  it("keeps the pass band-wide when runtime partGraph contains a non-object element", () => {
    for (const malformedNode of [null, 42]) {
      const { song, handoff } = songWithHandoff();
      handoff.partGraph = [malformedNode] as unknown as typeof handoff.partGraph;

      expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
      expect(resolveFirstLabeledHandoff(song)?.holdingRole).toBeNull();
    }
  });
});
