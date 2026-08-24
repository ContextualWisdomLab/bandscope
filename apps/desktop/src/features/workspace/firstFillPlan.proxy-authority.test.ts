import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstFillPlan } from "./firstFillPlan";

const DEMO_FILL_PLAN =
  "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";

describe("resolveFirstFillPlan own-data authority", () => {
  it("uses the snapshotted own-data fill plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo fill-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "fillPlan") {
          return "Injected proxy fill.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstFillPlan(song)?.fillPlan).toBe(DEMO_FILL_PLAN);
  });
});
