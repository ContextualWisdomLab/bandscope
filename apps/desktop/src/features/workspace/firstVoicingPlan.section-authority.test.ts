import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstVoicingPlan } from "./firstVoicingPlan";

describe("resolveFirstVoicingPlan section authority", () => {
  it("uses snapshotted own section identity, label, and time instead of Proxy get traps", () => {
    const song = createDemoRehearsalSong();
    const sectionIndex = song.sections.findIndex((section) => section.id === "verse-1");
    const section = sectionIndex >= 0 ? song.sections[sectionIndex] : undefined;
    expect(section).toBeDefined();
    if (!section || sectionIndex < 0) {
      throw new Error("Demo voicing-plan fixture is missing the expected verse section.");
    }

    const expectedId = Object.getOwnPropertyDescriptor(section, "id")?.value;
    const expectedLabel = Object.getOwnPropertyDescriptor(section, "label")?.value;
    const expectedRange = Object.getOwnPropertyDescriptor(section, "timeRange")?.value;
    expect(expectedId).toBe("verse-1");
    expect(expectedLabel).toBe("verse");
    expect(expectedRange?.start).toBe(10);

    song.sections[sectionIndex] = new Proxy(section, {
      get(target, property, receiver) {
        if (property === "id") {
          return "chorus-injected";
        }
        if (property === "label") {
          return "chorus";
        }
        if (property === "timeRange") {
          return { start: 25, end: 40 };
        }
        return Reflect.get(target, property, receiver);
      }
    });

    const resolved = resolveFirstVoicingPlan(song);
    expect(resolved).not.toBeNull();
    expect((resolved as unknown as { sectionId?: string })?.sectionId).toBe(expectedId);
    expect((resolved as unknown as { sectionLabel?: string })?.sectionLabel).toBe(expectedLabel);
    expect(resolved?.atSeconds).toBe(expectedRange?.start);
  });
});
