import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstDynamicsPlan } from "./firstDynamicsPlan";

const DEMO_DYNAMICS_PLAN =
  "Keep the verse under the vocal so the chorus still has somewhere to lift.";

describe("resolveFirstDynamicsPlan own-data authority", () => {
  it("uses the snapshotted own-data dynamics plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo dynamics-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "dynamicsPlan") {
          return "Injected proxy dynamics.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstDynamicsPlan(song)?.dynamicsPlan).toBe(DEMO_DYNAMICS_PLAN);
  });
});
