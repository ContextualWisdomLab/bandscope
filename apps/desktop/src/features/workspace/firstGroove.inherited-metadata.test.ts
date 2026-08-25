import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstGroove } from "./firstGroove";

function songWithGroove() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "groove-own";
  section.groove = "Straight eighths with a late snare feel";
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstGroove inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithGroove();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstGroove(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstGroove(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithGroove();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstGroove(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithGroove();
    Object.defineProperty(section, "groove", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile groove getter");
      }
    });

    expect(() => resolveFirstGroove(song)).not.toThrow();
    expect(resolveFirstGroove(song)).toBeNull();
  });

  it("does not treat own accessors as stable groove identity authority", () => {
    const { song, section } = songWithGroove();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "groove-own";
      }
    });

    expect(resolveFirstGroove(song)).toBeNull();
  });

  it("does not let inherited groove text establish the feel", () => {
    const { song, section } = songWithGroove();
    const inheritedGroove = Object.create({ groove: "Shuffle on the hats" }) as typeof section;
    Object.defineProperties(inheritedGroove, {
      id: { configurable: true, enumerable: true, value: "groove-own" },
      label: { configurable: true, enumerable: true, value: "verse" },
      timeRange: { configurable: true, enumerable: true, value: section.timeRange },
      roles: { configurable: true, enumerable: true, value: section.roles },
      partGraph: { configurable: true, enumerable: true, value: section.partGraph },
      confidence: { configurable: true, enumerable: true, value: section.confidence }
    });
    song.sections = [inheritedGroove];
    expect(resolveFirstGroove(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithGroove();
    const role = section.roles[0]!;
    const node = section.partGraph[0]!;
    section.roles = [Object.create(role) as typeof role];
    section.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstGroove(song);
    expect(resolved?.section.id).toBe("groove-own");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Straight eighths with a late snare feel");
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithGroove();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstGroove(song)).toBeNull();
  });
});
