import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPartHandoff } from "./firstPartHandoff";

function songWithPartHandoff() {
  const song = createDemoRehearsalSong();
  const template = structuredClone(song.sections[0]!);
  const bass = { ...template.roles[0]!, id: "bass-guitar", name: "Bass Guitar", rehearsalPriority: "high" as const };
  const vocal = { ...template.roles[2]!, id: "lead-vocal", name: "Lead Vocal", rehearsalPriority: "medium" as const };
  const source = {
    ...structuredClone(template),
    id: "handoff-source",
    timeRange: { start: 0, end: 10 },
    roles: [bass],
    partGraph: [
      { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: ["bass-guitar"] }
    ]
  };
  const destination = {
    ...structuredClone(template),
    id: "handoff-destination",
    label: "chorus" as const,
    timeRange: { start: 10, end: 30 },
    roles: [vocal],
    partGraph: [
      { role_id: "bass-guitar", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ]
  };
  song.sections = [source, destination];
  return { song, source, destination };
}

describe("resolveFirstPartHandoff inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, source, destination } = songWithPartHandoff();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstPartHandoff(inheritedSong)).toBeNull();

    song.sections = [Object.create(source) as typeof source, destination];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("rejects inherited destination timing fields", () => {
    const { song, destination } = songWithPartHandoff();
    destination.timeRange = Object.create({ start: 10, end: 30 }) as typeof destination.timeRange;
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, source } = songWithPartHandoff();
    Object.defineProperty(source.partGraph[0]!, "handoff_to", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile handoff_to getter");
      }
    });

    expect(() => resolveFirstPartHandoff(song)).not.toThrow();
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("does not treat own accessors as stable destination identity authority", () => {
    const { song, destination } = songWithPartHandoff();
    Object.defineProperty(destination, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "handoff-destination";
      }
    });

    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("does not let inherited source handoff edges establish the named pass", () => {
    const { song, source } = songWithPartHandoff();
    const inheritedNode = Object.create({
      handoff_to: ["lead-vocal"]
    }) as (typeof source.partGraph)[0];
    Object.defineProperties(inheritedNode, {
      role_id: { configurable: true, enumerable: true, value: "bass-guitar" },
      is_active: { configurable: true, enumerable: true, value: true },
      handoff_from: { configurable: true, enumerable: true, value: [] }
    });
    source.partGraph = [inheritedNode, source.partGraph[1]!];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the giving part", () => {
    const { song, source } = songWithPartHandoff();
    const node = source.partGraph[0]!;
    source.partGraph = [Object.create(node) as typeof node, source.partGraph[1]!];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, source, destination } = songWithPartHandoff();
    const arraySection = Object.assign([], source) as unknown as typeof source;
    song.sections = [arraySection, destination];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });
});
