import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHitPlan } from "./firstHitPlan";

const DEMO_HIT_PLAN =
  "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.";

describe("resolveFirstHitPlan own-data authority", () => {
  it("uses the snapshotted own-data hit plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo hit-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "hitPlan") {
          return "Injected proxy hit.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstHitPlan(song)?.hitPlan).toBe(DEMO_HIT_PLAN);
  });

  it("uses the snapshotted own-data time range instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Demo hit-plan fixture is missing the expected verse section.");
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

    expect(resolveFirstHitPlan(song)?.atSeconds).toBe(expectedStart);
  });

  it("returns snapshotted role identity and display copy instead of Proxy get values", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo hit-plan fixture is missing the expected Bass Guitar role.");
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

    const resolved = resolveFirstHitPlan(song) as
      | (ReturnType<typeof resolveFirstHitPlan> & {
          landingRoleId?: string;
          landingRoleName?: string;
        })
      | null;
    expect(resolved?.hitPlan).toBe(DEMO_HIT_PLAN);
    expect(resolved?.landingRoleId).toBe(expectedId);
    expect(resolved?.landingRoleName).toBe(expectedName);
  });
});
