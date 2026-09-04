import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTransition } from "./firstTransition";

function songWithTransition() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "change-own";
  section.timeRange = { start: 46, end: 54 };
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      cue: { kind: "transition", value: "Hold through the pickup before the downbeat." }
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
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
    section.timeRange = Object.create({ start: 46, end: 54 }) as typeof section.timeRange;
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

  it("does not treat own accessors as stable section identity authority", () => {
    const { song, section } = songWithTransition();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "change-own";
      }
    });

    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("does not let inherited role, cue, or graph metadata establish the holding part", () => {
    const { song, section } = songWithTransition();
    const role = section.roles[0]!;
    const node = section.partGraph[0]!;
    section.roles = [Object.create(role) as typeof role];
    section.partGraph = [Object.create(node) as typeof node];

    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithTransition();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("rejects inherited cue records even when kind looks like a transition", () => {
    const { song, section } = songWithTransition();
    section.roles[0]!.cue = Object.create({
      kind: "transition",
      value: "Hold through the pickup before the downbeat."
    }) as typeof section.roles[0]["cue"];
    expect(resolveFirstTransition(song)).toBeNull();
  });
});
