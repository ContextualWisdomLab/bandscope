import { render } from "@testing-library/react";
import { createDemoRehearsalSong, type RehearsalSection } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { PlayerFeature } from "../player";
import { resolveFirstIntro } from "./firstIntro";

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
    has(current, property) {
      if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) {
        throw new Error("numeric membership scan must stay bounded by materialized keys");
      }
      return Reflect.has(current, property);
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

describe("runtime section collection bounds", () => {
  it("does not scan a synthetic array length while resolving the first intro", () => {
    const song = createDemoRehearsalSong();
    const hostile = syntheticLengthSections();
    song.sections = hostile.sections;

    expect(resolveFirstIntro(song)).toBeNull();
    expect(hostile.numericDescriptorReads()).toBeLessThan(8);
  });

  it("fails closed without numeric membership scanning in the player summary", () => {
    const song = createDemoRehearsalSong();
    const hostile = syntheticLengthSections();
    song.sections = hostile.sections;

    expect(() => render(<PlayerFeature title="Player" song={song} />)).not.toThrow();
    expect(hostile.numericDescriptorReads()).toBeLessThan(8);
  });
});
