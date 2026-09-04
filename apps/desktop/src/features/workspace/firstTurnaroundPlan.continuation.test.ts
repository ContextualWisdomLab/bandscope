import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

describe("resolveFirstTurnaroundPlan continuation authority", () => {
  it("does not name a legacy turnaround plan when the landing role stops before the next section", () => {
    const song = createDemoRehearsalSong();
    const current = structuredClone(song.sections[0]!);
    const landingRole = current.roles.find((role) => role.id === "bass-guitar")!;
    landingRole.turnaroundPlan = "Hold the turnaround together.";
    delete landingRole.turnaroundPlanSource;
    for (const role of current.roles) {
      if (role.id !== landingRole.id) {
        delete role.turnaroundPlan;
        delete role.turnaroundPlanSource;
      }
    }

    const next = structuredClone(current);
    next.id = "chorus-after-turnaround";
    next.label = "chorus";
    next.timeRange = { start: current.timeRange.end, end: current.timeRange.end + 20 };
    next.roles = next.roles.map((role) => {
      const clone = { ...role };
      delete clone.turnaroundPlan;
      delete clone.turnaroundPlanSource;
      return clone;
    });
    next.partGraph = next.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === landingRole.id ? false : node.is_active
    }));

    song.sections = [current, next];

    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("does not name a turnaround when the landing role is the only source that continues", () => {
    const song = createDemoRehearsalSong();
    const current = structuredClone(song.sections[0]!);
    const landingRole = current.roles.find((role) => role.id === "bass-guitar")!;
    landingRole.turnaroundPlan = "Hold the turnaround together.";
    delete landingRole.turnaroundPlanSource;
    for (const role of current.roles) {
      if (role.id !== landingRole.id) {
        delete role.turnaroundPlan;
        delete role.turnaroundPlanSource;
      }
    }

    const next = structuredClone(current);
    next.id = "chorus-solo-continuation";
    next.label = "chorus";
    next.timeRange = { start: current.timeRange.end, end: current.timeRange.end + 20 };
    next.roles = next.roles
      .filter((role) => role.id === landingRole.id)
      .map((role) => {
        const clone = { ...role };
        delete clone.turnaroundPlan;
        delete clone.turnaroundPlanSource;
        return clone;
      });
    next.partGraph = next.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === landingRole.id
    }));

    song.sections = [current, next];

    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });
});
