import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTranspositionPlan } from "./firstTranspositionPlan";

function songWithTranspositionPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "transpose-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      transpositionPlan: "If the singer drops to B minor, keep the shape a whole step lower."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstTranspositionPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithTranspositionPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstTranspositionPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithTranspositionPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithTranspositionPlan();
    Object.defineProperty(section.roles[0]!, "transpositionPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile transpositionPlan getter");
      }
    });

    expect(() => resolveFirstTranspositionPlan(song)).not.toThrow();
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable transposition-plan identity authority", () => {
    const { song, section } = songWithTranspositionPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "transpose-own";
      }
    });

    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("does not let inherited transposition plans establish the named copy", () => {
    const { song, section } = songWithTranspositionPlan();
    const inheritedRole = Object.create({
      transpositionPlan: "Inherited transpose plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithTranspositionPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithTranspositionPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });
});
