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
});
