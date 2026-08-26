import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

function songWithTurnaroundPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "turnaround-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      turnaroundPlan: "Turn these last bars with Lead Vocal on the verse last beat; land the chorus downbeat together."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstTurnaroundPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithTurnaroundPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstTurnaroundPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithTurnaroundPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithTurnaroundPlan();
    Object.defineProperty(section.roles[0]!, "turnaroundPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile turnaroundPlan getter");
      }
    });

    expect(() => resolveFirstTurnaroundPlan(song)).not.toThrow();
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable turnaround-plan identity authority", () => {
    const { song, section } = songWithTurnaroundPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "turnaround-own";
      }
    });

    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("does not let inherited turnaround plans establish the named copy", () => {
    const { song, section } = songWithTurnaroundPlan();
    const inheritedRole = Object.create({
      turnaroundPlan: "Inherited turnaround plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the landing part", () => {
    const { song, section } = songWithTurnaroundPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithTurnaroundPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });
});
