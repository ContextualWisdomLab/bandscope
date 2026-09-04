import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupPlan } from "./firstPickupPlan";

const DEMO_PICKUP_PLAN = "Play this pickup with Lead Vocal; land the downbeat together.";

function songWithPredecessorPickup() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const intro = structuredClone(verse);
  intro.id = "intro-1";
  intro.label = "intro";
  intro.timeRange = { start: 0, end: verse.timeRange.start };
  intro.roles = intro.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  intro.partGraph = intro.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "bass-guitar"
  }));
  song.sections = [intro, verse];
  return song;
}

describe("resolveFirstPickupPlan own-data authority", () => {
  it("uses the snapshotted own-data pickup plan instead of a Proxy get trap", () => {
    const song = songWithPredecessorPickup();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo pickup-plan fixture is missing the expected Bass Guitar role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "pickupPlan") {
          return "Injected proxy pickup.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstPickupPlan(song)?.pickupPlan).toBe(DEMO_PICKUP_PLAN);
  });

  it("uses the snapshotted own-data time range instead of a Proxy get trap", () => {
    const song = songWithPredecessorPickup();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Demo pickup-plan fixture is missing the expected verse section.");
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

    expect(resolveFirstPickupPlan(song)?.atSeconds).toBe(expectedStart);
  });

  it("returns snapshotted role identity and display copy instead of Proxy get values", () => {
    const song = songWithPredecessorPickup();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "bass-guitar") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo pickup-plan fixture is missing the expected Bass Guitar role.");
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

    const resolved = resolveFirstPickupPlan(song);
    expect(resolved?.pickupPlan).toBe(DEMO_PICKUP_PLAN);
    expect(resolved?.landingRoleId).toBe(expectedId);
    expect(resolved?.landingRoleName).toBe(expectedName);
  });
});
