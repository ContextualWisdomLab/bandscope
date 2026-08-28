import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

const DEMO_BREAKDOWN_PLAN = "Hold this breakdown; keep it sparse until the drop.";

describe("resolveFirstBreakdownPlan landing authority", () => {
  it("does not name a breakdown when the previous graph is not dense enough", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const holdingRole = verse.roles.find((role) => role.id === "bass-guitar")!;
    holdingRole.breakdownPlan = DEMO_BREAKDOWN_PLAN;
    holdingRole.breakdownPlanSource = "model";
    verse.roles = [holdingRole];
    verse.partGraph = verse.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === holdingRole.id
    }));

    const intro = structuredClone(verse);
    intro.id = "intro-thin";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: verse.timeRange.start };
    intro.roles = intro.roles.map((role) => {
      const clone = { ...role };
      delete clone.breakdownPlan;
      delete clone.breakdownPlanSource;
      return clone;
    });
    intro.partGraph = intro.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === "bass-guitar" || node.role_id === "keys-right"
    }));
    song.sections = [intro, verse];

    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("does not name a breakdown when the rest and landing windows leave a gap", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    verse.roles[0]!.breakdownPlan = DEMO_BREAKDOWN_PLAN;
    verse.roles[0]!.breakdownPlanSource = "model";
    verse.partGraph = verse.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === "bass-guitar"
    }));
    const intro = structuredClone(verse);
    intro.id = "intro-gap";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: verse.timeRange.start - 1 };
    intro.roles = intro.roles.map((role) => {
      const clone = { ...role };
      delete clone.breakdownPlan;
      delete clone.breakdownPlanSource;
      return clone;
    });
    intro.partGraph = intro.partGraph.map((node) => ({ ...node, is_active: true }));
    song.sections = [intro, verse];

    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });
});
