import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstVoicingPlan } from "./firstVoicingPlan";

describe("resolveFirstVoicingPlan role authority", () => {
  it("uses snapshotted own role identity and priority instead of Proxy get traps", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "keys-right") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo voicing-plan fixture is missing the expected Keyboard 1 Right Hand role.");
    }

    const expectedId = Object.getOwnPropertyDescriptor(role, "id")?.value;
    const expectedName = Object.getOwnPropertyDescriptor(role, "name")?.value;
    const expectedPriority = Object.getOwnPropertyDescriptor(role, "rehearsalPriority")?.value;
    expect(expectedId).toBe("keys-right");
    expect(expectedName).toBeTypeOf("string");
    expect(expectedPriority).toBe("high");

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "id") {
          return "bass";
        }
        if (property === "name") {
          return "Injected proxy role";
        }
        if (property === "rehearsalPriority") {
          return "low";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    const resolved = resolveFirstVoicingPlan(song);
    expect(resolved?.holdingRoleId).toBe(expectedId);
    expect(resolved?.holdingRoleName).toBe(expectedName);
    expect(resolved?.voicingPlan).toContain("first inversion");
  });
});
