import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPartHandoff } from "./firstPartHandoff";

function songWithPartHandoff() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "handoff-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high"
    },
    {
      ...section.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "medium"
    }
  ];
  section.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: ["bass-guitar"] }
  ];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstPartHandoff inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithPartHandoff();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstPartHandoff(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithPartHandoff();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithPartHandoff();
    Object.defineProperty(section.partGraph[0]!, "handoff_to", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile handoff_to getter");
      }
    });

    expect(() => resolveFirstPartHandoff(song)).not.toThrow();
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("does not treat own accessors as stable section identity authority", () => {
    const { song, section } = songWithPartHandoff();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "handoff-own";
      }
    });

    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("does not let inherited handoff edges establish the named pass", () => {
    const { song, section } = songWithPartHandoff();
    const inheritedNode = Object.create({
      handoff_to: ["lead-vocal"]
    }) as (typeof section.partGraph)[0];
    Object.defineProperties(inheritedNode, {
      role_id: { configurable: true, enumerable: true, value: "bass-guitar" },
      is_active: { configurable: true, enumerable: true, value: true },
      handoff_from: { configurable: true, enumerable: true, value: [] }
    });
    section.partGraph = [inheritedNode, section.partGraph[1]!];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithPartHandoff();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node, section.partGraph[1]!];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithPartHandoff();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });
});
