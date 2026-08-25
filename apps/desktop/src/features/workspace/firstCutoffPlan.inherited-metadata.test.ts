import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstCutoffPlan } from "./firstCutoffPlan";

function songWithCutoffPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "cutoff-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      cutoffPlan: "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstCutoffPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithCutoffPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstCutoffPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithCutoffPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithCutoffPlan();
    Object.defineProperty(section.roles[0]!, "cutoffPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile cutoffPlan getter");
      }
    });

    expect(() => resolveFirstCutoffPlan(song)).not.toThrow();
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable cutoff-plan identity authority", () => {
    const { song, section } = songWithCutoffPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "cutoff-own";
      }
    });

    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("does not let inherited cutoff plans establish the named copy", () => {
    const { song, section } = songWithCutoffPlan();
    const inheritedRole = Object.create({
      cutoffPlan: "Inherited cutoff plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the landing part", () => {
    const { song, section } = songWithCutoffPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithCutoffPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });
});
