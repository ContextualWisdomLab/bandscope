import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHitPlan } from "./firstHitPlan";

function songWithHitPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "hit-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      hitPlan: "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstHitPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithHitPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstHitPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithHitPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithHitPlan();
    Object.defineProperty(section.roles[0]!, "hitPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile hitPlan getter");
      }
    });

    expect(() => resolveFirstHitPlan(song)).not.toThrow();
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable hit-plan identity authority", () => {
    const { song, section } = songWithHitPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "hit-own";
      }
    });

    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("does not let inherited hit plans establish the named copy", () => {
    const { song, section } = songWithHitPlan();
    const inheritedRole = Object.create({
      hitPlan: "Inherited hit plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the landing part", () => {
    const { song, section } = songWithHitPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithHitPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstHitPlan(song)).toBeNull();
  });
});
