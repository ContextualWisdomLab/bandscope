import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

const DEMO_BREAKDOWN_PLAN = "Hold this breakdown; keep it sparse until the drop.";

function songWithPredecessorBreakdown() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const chorus = structuredClone(verse);
  chorus.id = "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: verse.timeRange.end, end: verse.timeRange.end + 16 };
  const bass = chorus.roles.find((role) => role.id === "bass-guitar")!;
  bass.breakdownPlan = DEMO_BREAKDOWN_PLAN;
  chorus.partGraph = chorus.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === "bass-guitar"
  }));
  song.sections = [verse, chorus];
  return song;
}

describe("resolveFirstBreakdownPlan own-data authority", () => {
  it("uses the snapshotted own-data breakdown plan instead of a Proxy get trap", () => {
    const song = songWithPredecessorBreakdown();
    const section = song.sections.find((candidate) => candidate.id === "chorus-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo breakdown-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "breakdownPlan") {
          return "Injected proxy breakdown.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstBreakdownPlan(song)?.breakdownPlan).toBe(DEMO_BREAKDOWN_PLAN);
  });

  it("uses the snapshotted own-data time range instead of a Proxy get trap", () => {
    const song = songWithPredecessorBreakdown();
    const section = song.sections.find((candidate) => candidate.id === "chorus-1");
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Demo breakdown-plan fixture is missing the expected chorus section.");
    }
    const expectedStart = section.timeRange.start;
    section.timeRange = new Proxy(section.timeRange, {
      get(target, property, receiver) {
        if (property === "start") {
          return expectedStart + 15;
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstBreakdownPlan(song)?.atSeconds).toBe(expectedStart);
  });

  it("returns snapshotted role identity and display copy instead of Proxy get values", () => {
    const song = songWithPredecessorBreakdown();
    const section = song.sections.find((candidate) => candidate.id === "chorus-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo breakdown-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "id") {
          return "proxy-id";
        }
        if (property === "name") {
          return "Proxy Name";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    const resolved = resolveFirstBreakdownPlan(song);
    expect(resolved?.holdingRoleId).toBe("bass-guitar");
    expect(resolved?.holdingRoleName).toBe("Bass Guitar");
  });
});
