import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

const DEMO_BREAKDOWN_PLAN = "Hold this breakdown; keep it sparse until the drop.";

describe("demo breakdown plan", () => {
  it("does not name a demo breakdown without a predecessor dense graph", () => {
    expect(resolveFirstBreakdownPlan(createDemoRehearsalSong())).toBeNull();
  });

  it("keeps a seeded demo breakdown actionable across a real predecessor dense graph", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
    chorus.roles = chorus.roles.map((role) => {
      const clone = { ...role };
      delete clone.breakdownPlan;
      delete clone.breakdownPlanSource;
      return clone;
    });
    const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
    bass.breakdownPlan = DEMO_BREAKDOWN_PLAN;
    bass.breakdownPlanSource = "model";
    chorus.partGraph = chorus.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === "bass-guitar"
    }));
    song.sections = [verse, chorus];

    expect(resolveFirstBreakdownPlan(song)).toMatchObject({
      sectionId: "chorus-1",
      holdingRoleId: "bass-guitar",
      atSeconds: 30
    });
  });
});
