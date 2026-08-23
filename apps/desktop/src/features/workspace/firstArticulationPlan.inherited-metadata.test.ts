import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstArticulationPlan } from "./firstArticulationPlan";

function songWithArticulationPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "articulation-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      articulationPlan: "Keep the verse attack short so the chorus still has a longer sustain to land on."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstArticulationPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithArticulationPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstArticulationPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithArticulationPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithArticulationPlan();
    Object.defineProperty(section.roles[0]!, "articulationPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile articulationPlan getter");
      }
    });

    expect(() => resolveFirstArticulationPlan(song)).not.toThrow();
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable articulation-plan identity authority", () => {
    const { song, section } = songWithArticulationPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "articulation-own";
      }
    });

    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("does not let inherited articulation plans establish the named copy", () => {
    const { song, section } = songWithArticulationPlan();
    const inheritedRole = Object.create({
      articulationPlan: "Inherited articulation plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithArticulationPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithArticulationPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });
});
