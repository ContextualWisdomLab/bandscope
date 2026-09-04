import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

const DEMO_TURNAROUND_PLAN =
  "Turn these last bars with Lead Vocal on the verse last beat; land the chorus downbeat together.";

describe("resolveFirstTurnaroundPlan own-data authority", () => {
  it("uses the snapshotted own-data turnaround plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo turnaround-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "turnaroundPlan") {
          return "Injected proxy turnaround.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstTurnaroundPlan(song)?.turnaroundPlan).toBe(DEMO_TURNAROUND_PLAN);
  });

  it("uses the snapshotted own-data time range instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Demo turnaround-plan fixture is missing the expected verse section.");
    }
    const expectedEnd = section.timeRange.end;
    section.timeRange = new Proxy(section.timeRange, {
      get(target, property, receiver) {
        if (property === "end") {
          return expectedEnd + 15;
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstTurnaroundPlan(song)?.atSeconds).toBe(expectedEnd);
  });

  it("returns snapshotted role identity and display copy instead of Proxy get values", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo turnaround-plan fixture is missing the expected Bass Guitar role.");
    }
    const expectedId = role.id;
    const expectedName = role.name;
    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "name") {
          return "Injected proxy role";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    const resolved = resolveFirstTurnaroundPlan(song);
    expect(resolved?.turnaroundPlan).toBe(DEMO_TURNAROUND_PLAN);
    expect(resolved?.landingRoleId).toBe(expectedId);
    expect(resolved?.landingRoleName).toBe(expectedName);
  });
});
