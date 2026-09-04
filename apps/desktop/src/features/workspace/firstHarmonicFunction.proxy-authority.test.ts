import { createDemoRehearsalSong, type RehearsalRole } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHarmonicFunction } from "./firstHarmonicFunction";

describe("resolveFirstHarmonicFunction Proxy authority", () => {
  it("uses the owned function-label descriptor instead of a Proxy get substitution", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    const trustedHarmony = role.harmony!;
    const hostileHarmony = new Proxy(trustedHarmony, {
      get(target, property, receiver) {
        if (property === "functionLabel") {
          return "proxy injected function";
        }
        return Reflect.get(target, property, receiver);
      }
    });
    Object.defineProperty(role, "harmony", {
      configurable: true,
      enumerable: true,
      value: hostileHarmony
    });

    expect(resolveFirstHarmonicFunction(song)?.functionLabel).toBe("vi pedal anchor");
  });

  it("does not let a Proxy get trap replace the owned role identity used for graph corroboration", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const role = section.roles[0]!;
    Object.defineProperty(role, "id", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: "descriptor-only-role"
    });
    const hostileRole = new Proxy(role, {
      get(target, property, receiver) {
        if (property === "id") {
          return "bass-guitar";
        }
        return Reflect.get(target, property, receiver);
      }
    });
    section.roles = [hostileRole as RehearsalRole];

    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });
});
