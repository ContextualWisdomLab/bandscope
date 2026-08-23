import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstCountCue } from "./firstCountCue";

function songWithCount() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "count-own";
  section.roles = [
    {
      ...section.roles[1]!,
      cue: { kind: "count", value: "Enter on beat 2 after the pickup." }
    }
  ];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstCountCue inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithCount();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstCountCue(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstCountCue(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithCount();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstCountCue(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithCount();
    Object.defineProperty(section.roles[0]!, "cue", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile cue getter");
      }
    });

    expect(() => resolveFirstCountCue(song)).not.toThrow();
    expect(resolveFirstCountCue(song)).toBeNull();
  });

  it("does not treat own accessors as stable count identity authority", () => {
    const { song, section } = songWithCount();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "count-own";
      }
    });

    expect(resolveFirstCountCue(song)).toBeNull();
  });

  it("does not let inherited cue metadata establish the entrance", () => {
    const { song, section } = songWithCount();
    section.roles[0]!.cue = Object.create({
      kind: "count",
      value: "Inherited count"
    }) as typeof section.roles[0]["cue"];
    expect(resolveFirstCountCue(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithCount();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstCountCue(song);
    expect(resolved?.section.id).toBe("count-own");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Enter on beat 2 after the pickup.");
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithCount();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstCountCue(song)).toBeNull();
  });
});
