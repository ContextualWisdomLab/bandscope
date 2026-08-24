import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHookPlan } from "./firstHookPlan";

function songWithHookPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "hook-own";
  section.roles = [
    {
      ...section.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high",
      hookPlan: "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony."
    }
  ];
  section.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstHookPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithHookPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstHookPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithHookPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithHookPlan();
    Object.defineProperty(section.roles[0]!, "hookPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile hookPlan getter");
      }
    });

    expect(() => resolveFirstHookPlan(song)).not.toThrow();
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable hook-plan identity authority", () => {
    const { song, section } = songWithHookPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "hook-own";
      }
    });

    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("does not let inherited hook plans establish the named copy", () => {
    const { song, section } = songWithHookPlan();
    const inheritedRole = Object.create({
      hookPlan: "Inherited hook plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithHookPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithHookPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstHookPlan(song)).toBeNull();
  });
});
