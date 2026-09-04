import { createDemoRehearsalSong, type RehearsalSection, type RehearsalSong } from "@bandscope/shared-types";
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

  it("fails closed when the song ownership check hits a descriptor trap", () => {
    const song = new Proxy(createDemoRehearsalSong(), {
      getOwnPropertyDescriptor() {
        throw new Error("descriptor trap");
      }
    }) as RehearsalSong;

    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("fails closed when runtime section enumeration hits a proxy trap", () => {
    const song = createDemoRehearsalSong();
    song.sections = new Proxy(song.sections, {
      ownKeys() {
        throw new Error("ownKeys trap");
      }
    });

    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });
});
