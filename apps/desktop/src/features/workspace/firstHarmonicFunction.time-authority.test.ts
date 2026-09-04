import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHarmonicFunction } from "./firstHarmonicFunction";

describe("resolveFirstHarmonicFunction time authority", () => {
  it("uses owned time-range descriptors instead of Proxy get substitutions", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const trustedTimeRange = section.timeRange;
    const hostileTimeRange = new Proxy(trustedTimeRange, {
      get(target, property, receiver) {
        if (property === "start") {
          return 20;
        }
        return Reflect.get(target, property, receiver);
      }
    });
    Object.defineProperty(section, "timeRange", {
      configurable: true,
      enumerable: true,
      value: hostileTimeRange
    });

    expect(resolveFirstHarmonicFunction(song)?.atSeconds).toBe(10);
  });
});
