import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTransition } from "./firstTransition";

function songWithTransition() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "transition-own";
  section.roles = [
    {
      ...section.roles[0]!,
      cue: { kind: "transition", value: "Hold through the pickup before the downbeat." }
    }
  ];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstTransition inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithTransition();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstTransition(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithTransition();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithTransition();
    Object.defineProperty(section.roles[0]!, "cue", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile cue getter");
      }
    });

    expect(() => resolveFirstTransition(song)).not.toThrow();
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("does not treat own accessors as stable transition identity authority", () => {
    const { song, section } = songWithTransition();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "transition-own";
      }
    });

    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("does not let inherited cue metadata establish the change", () => {
    const { song, section } = songWithTransition();
    section.roles[0]!.cue = Object.create({
      kind: "transition",
      value: "Inherited hold"
    }) as typeof section.roles[0]["cue"];
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithTransition();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];

    const resolved = resolveFirstTransition(song);
    expect(resolved?.section.id).toBe("transition-own");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Hold through the pickup before the downbeat.");
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithTransition();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstTransition(song)).toBeNull();
  });
});
