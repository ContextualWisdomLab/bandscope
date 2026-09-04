import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstOverlap } from "./firstOverlap";

function songWithOverlap() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "overlap-own";
  section.roles = [
    {
      ...section.roles[0]!,
      overlapWarnings: ["Density warning: competing with Keyboard Left Hand in low register."]
    }
  ];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstOverlap inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithOverlap();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstOverlap(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstOverlap(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithOverlap();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstOverlap(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithOverlap();
    Object.defineProperty(section.roles[0]!, "overlapWarnings", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile overlapWarnings getter");
      }
    });

    expect(() => resolveFirstOverlap(song)).not.toThrow();
    expect(resolveFirstOverlap(song)).toBeNull();
  });

  it("does not treat own accessors as stable overlap identity authority", () => {
    const { song, section } = songWithOverlap();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "overlap-own";
      }
    });

    expect(resolveFirstOverlap(song)).toBeNull();
  });

  it("does not let inherited overlap warnings establish the clash", () => {
    const { song, section } = songWithOverlap();
    const inheritedOverlap = Object.create({
      overlapWarnings: ["Inherited clash"]
    }) as typeof section.roles[0];
    Object.defineProperties(inheritedOverlap, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedOverlap];
    expect(resolveFirstOverlap(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithOverlap();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstOverlap(song);
    expect(resolved?.section.id).toBe("overlap-own");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Density warning: competing with Keyboard Left Hand in low register.");
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithOverlap();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstOverlap(song)).toBeNull();
  });
});
