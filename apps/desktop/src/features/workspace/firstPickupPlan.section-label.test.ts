import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupPlan } from "./firstPickupPlan";

describe("resolveFirstPickupPlan section-label authority", () => {
  it("fails closed when runtime metadata supplies a label outside the shared SectionFormLabel contract", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const intro = structuredClone(verse);
    intro.id = "intro-1";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: verse.timeRange.start };
    intro.roles = intro.roles.map((role) => {
      const clone = { ...role };
      delete clone.pickupPlan;
      delete clone.pickupPlanSource;
      return clone;
    });
    intro.partGraph = intro.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id !== "bass-guitar"
    }));
    song.sections = [intro, verse];
    (verse as unknown as { label: string }).label = "verse-legacy";

    expect(resolveFirstPickupPlan(song)).toBeNull();
  });
});
