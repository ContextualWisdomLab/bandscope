import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstCapoPlan } from "./firstCapoPlan";

function songWithCapoPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "transpose-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "acoustic-guitar",
      name: "Acoustic Guitar",
      rehearsalPriority: "high",
      capoPlan: "Capo 2 in standard tuning so the verse fingers G shapes."
    }
  ];
  section.partGraph = [{ role_id: "acoustic-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstCapoPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithCapoPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstCapoPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithCapoPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithCapoPlan();
    Object.defineProperty(section.roles[0]!, "capoPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile capoPlan getter");
      }
    });

    expect(() => resolveFirstCapoPlan(song)).not.toThrow();
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable capo-plan identity authority", () => {
    const { song, section } = songWithCapoPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "transpose-own";
      }
    });

    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("does not let inherited capo plans establish the named copy", () => {
    const { song, section } = songWithCapoPlan();
    const inheritedRole = Object.create({
      capoPlan: "Inherited capo plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "acoustic-guitar" },
      name: { configurable: true, enumerable: true, value: "Acoustic Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithCapoPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithCapoPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });
});
