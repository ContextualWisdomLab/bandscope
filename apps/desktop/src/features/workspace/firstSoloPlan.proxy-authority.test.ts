import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstSoloPlan } from "./firstSoloPlan";

describe("resolveFirstSoloPlan runtime authority", () => {
  it("fails closed when a Proxy get trap can substitute solo-plan copy", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "keys-right") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo solo-plan fixture is missing the expected Keyboard 1 Right Hand role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "soloPlan") {
          return "Injected proxy solo.";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("fails closed when a Proxy get trap can substitute the time range", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    expect(section).toBeDefined();
    if (!section) {
      throw new Error("Demo solo-plan fixture is missing the expected verse section.");
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

    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("fails closed when a Proxy get trap can substitute role identity or display copy", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "keys-right") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo solo-plan fixture is missing the expected Keyboard 1 Right Hand role.");
    }
    section.roles[roleIndex] = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "id") {
          return "injected-proxy-id";
        }
        if (property === "name") {
          return "Injected proxy role";
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("fails closed when a Proxy descriptor trap fabricates solo-plan authority", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const roleIndex = section?.roles.findIndex((role) => role.id === "keys-right") ?? -1;
    const role = roleIndex >= 0 ? section?.roles[roleIndex] : undefined;
    expect(section).toBeDefined();
    expect(role).toBeDefined();
    if (!section || !role || roleIndex < 0) {
      throw new Error("Demo solo-plan fixture is missing the expected Keyboard 1 Right Hand role.");
    }

    section.roles[roleIndex] = new Proxy(role, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "soloPlan") {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: "Injected descriptor solo."
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });

    expect(resolveFirstSoloPlan(song)).toBeNull();
  });
});
