import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstRiffPlan } from "./firstRiffPlan";

const DEMO_RIFF_PLAN =
  "Bass locks the verse riff on the open fifth; keep it dry before the chorus lift.";

describe("resolveFirstRiffPlan own-data authority", () => {
  it("uses the snapshotted own-data riff plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo riff-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "riffPlan") {
          return "Injected proxy riff.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstRiffPlan(song)?.riffPlan).toBe(DEMO_RIFF_PLAN);
  });
});
