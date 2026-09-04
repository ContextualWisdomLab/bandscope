import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTuningPlan } from "./firstTuningPlan";

const DEMO_TUNING_PLAN =
  "Tune the E string down to D so the verse riff sits on the open fifth.";

describe("resolveFirstTuningPlan own-data authority", () => {
  it("uses the snapshotted own-data tuning plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo tuning-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "tuningPlan") {
          return "Injected proxy tuning.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstTuningPlan(song)?.tuningPlan).toBe(DEMO_TUNING_PLAN);
  });

  it("uses the snapshotted own-data time range instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Demo tuning-plan fixture is missing the expected verse section.");
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

    expect(resolveFirstTuningPlan(song)?.atSeconds).toBe(expectedStart);
  });

  it("returns snapshotted role identity and display copy instead of Proxy get values", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo tuning-plan fixture is missing the expected Bass Guitar role.");
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

    const resolved = resolveFirstTuningPlan(song) as
      | (ReturnType<typeof resolveFirstTuningPlan> & {
          holdingRoleId?: string;
          holdingRoleName?: string;
        })
      | null;
    expect(resolved?.holdingRoleId).toBe(expectedId);
    expect(resolved?.holdingRoleName).toBe(expectedName);
  });
});
