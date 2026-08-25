import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstCutoffPlan } from "./firstCutoffPlan";

const DEMO_CUTOFF_PLAN =
  "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup.";

describe("resolveFirstCutoffPlan own-data authority", () => {
  it("uses the snapshotted own-data cutoff plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo cutoff-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "cutoffPlan") {
          return "Injected proxy cutoff.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstCutoffPlan(song)?.cutoffPlan).toBe(DEMO_CUTOFF_PLAN);
  });

  it("uses the snapshotted own-data time range instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Demo cutoff-plan fixture is missing the expected verse section.");
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

    expect(resolveFirstCutoffPlan(song)?.atSeconds).toBe(expectedEnd);
  });

  it("returns snapshotted role identity and display copy instead of Proxy get values", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo cutoff-plan fixture is missing the expected Bass Guitar role.");
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

    const resolved = resolveFirstCutoffPlan(song) as
      | (ReturnType<typeof resolveFirstCutoffPlan> & {
          landingRoleId?: string;
          landingRoleName?: string;
        })
      | null;
    expect(resolved?.cutoffPlan).toBe(DEMO_CUTOFF_PLAN);
    expect(resolved?.landingRoleId).toBe(expectedId);
    expect(resolved?.landingRoleName).toBe(expectedName);
  });
});
