import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstDynamicsPlan } from "./firstDynamicsPlan";

function songWithDynamicsPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "dynamics-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      dynamicsPlan: "Keep the verse under the vocal so the chorus still has somewhere to lift."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstDynamicsPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithDynamicsPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstDynamicsPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithDynamicsPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithDynamicsPlan();
    Object.defineProperty(section.roles[0]!, "dynamicsPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile dynamicsPlan getter");
      }
    });

    expect(() => resolveFirstDynamicsPlan(song)).not.toThrow();
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable dynamics-plan identity authority", () => {
    const { song, section } = songWithDynamicsPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "dynamics-own";
      }
    });

    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("does not let inherited dynamics plans establish the named copy", () => {
    const { song, section } = songWithDynamicsPlan();
    const inheritedRole = Object.create({
      dynamicsPlan: "Inherited dynamics plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithDynamicsPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithDynamicsPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });
});
