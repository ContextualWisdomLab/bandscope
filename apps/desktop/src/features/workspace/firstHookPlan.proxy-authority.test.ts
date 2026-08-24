import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHookPlan } from "./firstHookPlan";

const DEMO_HOOK_PLAN =
  "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";

describe("resolveFirstHookPlan own-data authority", () => {
  it("uses the snapshotted own-data hook plan instead of a Proxy get trap", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "lead-vocal") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo hook-plan fixture is missing the expected Lead Vocal role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "hookPlan") {
          return "Injected proxy hook.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstHookPlan(song)?.hookPlan).toBe(DEMO_HOOK_PLAN);
  });
});
