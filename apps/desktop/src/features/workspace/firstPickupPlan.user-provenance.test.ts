import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupPlan } from "./firstPickupPlan";

const GENERATED_PREFIX = "Play this pickup with ";
const GENERATED_SUFFIX = "; land the downbeat together.";

function userPlanSong(pickupPlan: string) {
  const song = createDemoRehearsalSong();
  const current = structuredClone(song.sections[0]!);
  current.id = "user-pickup";
  current.timeRange = { start: 10, end: 30 };
  current.roles = [
    {
      ...current.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      pickupPlan,
      pickupPlanSource: "user"
    },
    {
      ...current.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "medium"
    }
  ];
  delete current.roles[1]!.pickupPlan;
  delete current.roles[1]!.pickupPlanSource;
  current.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];

  const previous = structuredClone(current);
  previous.id = "user-pickup-rest";
  previous.label = "intro";
  previous.timeRange = { start: 0, end: 10 };
  previous.roles = previous.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  previous.partGraph = previous.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "bass-guitar"
  }));

  song.sections = [previous, current];
  return song;
}

describe("resolveFirstPickupPlan user provenance", () => {
  it("bounds user-authored generated-shape copy as user text instead of rewriting the target", () => {
    const pickupPlan = `${GENERATED_PREFIX}${"A".repeat(170)}${GENERATED_SUFFIX}`;
    const expected = Array.from(pickupPlan).slice(0, 180).join("");

    const resolved = resolveFirstPickupPlan(userPlanSong(pickupPlan));

    expect(resolved?.pickupPlanSource).toBe("user");
    expect(resolved?.pickupPlan).toBe(expected);
    expect(resolved?.pickupPlan?.endsWith(GENERATED_SUFFIX)).toBe(false);
  });
});
