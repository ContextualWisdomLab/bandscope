import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstVoicingPlan } from "./firstVoicingPlan";

const DEMO_VOICING_PLAN =
  "Keep the verse voicing in first inversion so the top line still sings over the guitars.";

describe("resolveFirstVoicingPlan own-data authority", () => {
  it("uses the snapshotted own-data voicing plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "keys-right") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo voicing-plan fixture is missing the expected Keyboard 1 Right Hand role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "voicingPlan") {
          return "Injected proxy voicing.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstVoicingPlan(song)?.voicingPlan).toBe(DEMO_VOICING_PLAN);
  });
});
