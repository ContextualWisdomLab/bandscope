import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHarmonicExplanation } from "./firstHarmonicExplanation";

function songWithHarmonicExplanation() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "explained-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      harmonicExplanation: "The bass holds the vi center."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstHarmonicExplanation inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithHarmonicExplanation();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstHarmonicExplanation(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithHarmonicExplanation();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("rejects a non-object owned rehearsal window", () => {
    const { song, section } = songWithHarmonicExplanation();
    (section as unknown as { timeRange: unknown }).timeRange = null;

    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("rejects a non-array owned role collection", () => {
    const { song, section } = songWithHarmonicExplanation();
    (section as unknown as { roles: unknown }).roles = {};

    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithHarmonicExplanation();
    Object.defineProperty(section.roles[0]!, "harmonicExplanation", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile harmonicExplanation getter");
      }
    });

    expect(() => resolveFirstHarmonicExplanation(song)).not.toThrow();
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("does not treat own accessors as stable explanation identity authority", () => {
    const { song, section } = songWithHarmonicExplanation();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "explained-own";
      }
    });

    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("does not let inherited explanations establish the named copy", () => {
    const { song, section } = songWithHarmonicExplanation();
    const inheritedRole = Object.create({
      harmonicExplanation: "Inherited harmonic explanation"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithHarmonicExplanation();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("fails closed when an explanation descriptor changes after role qualification", () => {
    const { song, section } = songWithHarmonicExplanation();
    const role = section.roles[0]!;
    let explanationDescriptorReads = 0;
    const unstableRole = new Proxy(role, {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        if (property !== "harmonicExplanation" || descriptor === undefined) {
          return descriptor;
        }
        explanationDescriptorReads += 1;
        return explanationDescriptorReads === 1 ? descriptor : { ...descriptor, value: "" };
      }
    });
    section.roles = [unstableRole];

    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("contains a descriptor trap at the outer resolver boundary", () => {
    const { song } = songWithHarmonicExplanation();
    const hostileSong = new Proxy(song, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "sections") {
          throw new Error("hostile sections descriptor trap");
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });

    expect(() => resolveFirstHarmonicExplanation(hostileSong)).not.toThrow();
    expect(resolveFirstHarmonicExplanation(hostileSong)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithHarmonicExplanation();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("rejects an out-of-contract section label from untrusted runtime data", () => {
    const { song, section } = songWithHarmonicExplanation();
    (section as unknown as { label: string }).label = "verse-legacy";

    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });
});
