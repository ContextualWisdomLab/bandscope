import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstSoloPlan } from "./firstSoloPlan";

function songWithSoloPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "solo-own";
  section.roles = [
    {
      ...section.roles[2]!,
      id: "keys-right",
      name: "Keyboard 1 Right Hand",
      rehearsalPriority: "high",
      soloPlan: "Hold the verse solo; everyone else drops to a two-bar pad so the run can land."
    }
  ];
  section.partGraph = [{ role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstSoloPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithSoloPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstSoloPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithSoloPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithSoloPlan();
    Object.defineProperty(section.roles[0]!, "soloPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile soloPlan getter");
      }
    });

    expect(() => resolveFirstSoloPlan(song)).not.toThrow();
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable solo-plan identity authority", () => {
    const { song, section } = songWithSoloPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "solo-own";
      }
    });

    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("does not let inherited solo plans establish the named copy", () => {
    const { song, section } = songWithSoloPlan();
    const inheritedRole = Object.create({
      soloPlan: "Inherited solo plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithSoloPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithSoloPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });
});
