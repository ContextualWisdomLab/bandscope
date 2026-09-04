import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupPlan } from "./firstPickupPlan";

describe("demo pickup plan", () => {
  it("does not name a demo pickup without a predecessor rest", () => {
    expect(resolveFirstPickupPlan(createDemoRehearsalSong())).toBeNull();
  });

  it("keeps the demo pickup actionable across a real predecessor rest", () => {
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

    expect(resolveFirstPickupPlan(song)).toMatchObject({
      sectionId: "verse-1",
      landingRoleId: "bass-guitar",
      atSeconds: 10
    });
  });
});
