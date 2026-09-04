import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHarmonicFunction } from "./firstHarmonicFunction";

function songWithFunctionLabel() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "function-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      harmony: {
        chord: "C#m7",
        functionLabel: "vi pedal anchor",
        source: "model"
      }
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstHarmonicFunction inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithFunctionLabel();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstHarmonicFunction(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithFunctionLabel();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithFunctionLabel();
    Object.defineProperty(section.roles[0]!.harmony, "functionLabel", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile functionLabel getter");
      }
    });

    expect(() => resolveFirstHarmonicFunction(song)).not.toThrow();
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("does not treat own accessors as stable harmonic-function identity authority", () => {
    const { song, section } = songWithFunctionLabel();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "function-own";
      }
    });

    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("does not let inherited function labels establish the named copy", () => {
    const { song, section } = songWithFunctionLabel();
    const inheritedHarmony = Object.create({
      functionLabel: "Inherited harmonic function"
    }) as (typeof section.roles)[0]["harmony"];
    Object.defineProperties(inheritedHarmony, {
      chord: { configurable: true, enumerable: true, value: "C#m7" },
      source: { configurable: true, enumerable: true, value: "model" }
    });
    const inheritedRole = Object.create({
      harmony: inheritedHarmony
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithFunctionLabel();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithFunctionLabel();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("does not let inherited harmony records supply the named function", () => {
    const { song, section } = songWithFunctionLabel();
    const inheritedHarmony = Object.create({
      chord: "C#m7",
      functionLabel: "vi pedal anchor",
      source: "model"
    }) as (typeof section.roles)[0]["harmony"];
    Object.defineProperty(section.roles[0]!, "harmony", {
      configurable: true,
      enumerable: true,
      value: inheritedHarmony
    });
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });
});
