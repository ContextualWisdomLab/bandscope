import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

const GENERATED_PREFIX = "Hold this breakdown with ";
const GENERATED_SUFFIX = "; keep it sparse until the drop.";

function userPlanSong(breakdownPlan: string) {
  const song = createDemoRehearsalSong();
  const current = structuredClone(song.sections[0]!);
  current.id = "user-breakdown";
  current.timeRange = { start: 10, end: 30 };
  current.roles = [
    {
      ...current.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      breakdownPlan,
      breakdownPlanSource: "user"
    }
  ];
  current.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
  ];

  const previous = structuredClone(current);
  previous.id = "user-breakdown-full";
  previous.label = "intro";
  previous.timeRange = { start: 0, end: 10 };
  previous.roles = previous.roles.map((role) => {
    const clone = { ...role };
    delete clone.breakdownPlan;
    delete clone.breakdownPlanSource;
    return clone;
  });
  previous.partGraph = previous.partGraph.map((node) => ({ ...node, is_active: true }));

  song.sections = [previous, current];
  return song;
}

describe("resolveFirstBreakdownPlan user provenance", () => {
  it("preserves long user-authored generated-shape copy instead of rewriting the target", () => {
    const breakdownPlan = `${GENERATED_PREFIX}${"A".repeat(170)}${GENERATED_SUFFIX}`;

    const resolved = resolveFirstBreakdownPlan(userPlanSong(breakdownPlan));

    expect(resolved?.breakdownPlanSource).toBe("user");
    expect(resolved?.breakdownPlan).toBe(breakdownPlan);
    expect(resolved?.breakdownPlan?.endsWith(GENERATED_SUFFIX)).toBe(true);
  });
});
