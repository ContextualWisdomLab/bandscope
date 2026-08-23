import { createDemoRehearsalSong, type RehearsalSection } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveTonightStartingChord, resolveTonightTransposePlan } from "./rehearsalMetrics";

function syntheticLengthSections() {
  const target: RehearsalSection[] = [];
  target.length = 256;
  let numericDescriptorReads = 0;

  const sections = new Proxy(target, {
    getOwnPropertyDescriptor(current, property) {
      if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) {
        numericDescriptorReads += 1;
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: undefined
        };
      }
      return Reflect.getOwnPropertyDescriptor(current, property);
    },
    ownKeys() {
      return ["length"];
    }
  });

  return {
    sections,
    numericDescriptorReads: () => numericDescriptorReads
  };
}

describe("rehearsal metric runtime collection bounds", () => {
  it("does not scan a synthetic section length while resolving first-entrance metrics", () => {
    const song = createDemoRehearsalSong();
    const hostile = syntheticLengthSections();
    song.sections = hostile.sections;

    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
    expect(hostile.numericDescriptorReads()).toBeLessThan(8);
  });
});
