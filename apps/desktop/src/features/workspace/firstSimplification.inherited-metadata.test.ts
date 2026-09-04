import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstSimplification } from "./firstSimplification";

function songWithSimplification() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "verse-own";
  section.label = "verse";
  section.timeRange = { start: 10, end: 30 };
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      simplification: "Stay on roots if the chorus entrance gets muddy."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstSimplification inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithSimplification();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstSimplification(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithSimplification();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithSimplification();
    Object.defineProperty(section, "label", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile section label getter");
      }
    });

    expect(() => resolveFirstSimplification(song)).not.toThrow();
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("does not treat own accessors as stable section identity authority", () => {
    const { song, section } = songWithSimplification();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "verse-own";
      }
    });

    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("does not let inherited role, graph, or simplification metadata establish the easier pass", () => {
    const { song, section } = songWithSimplification();
    const role = section.roles[0]!;
    const node = section.partGraph[0]!;
    const inheritedRole = Object.create(role) as typeof role;
    section.roles = [inheritedRole];
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("rejects an inherited simplification string even when identity is owned", () => {
    const { song, section } = songWithSimplification();
    const role = section.roles[0]!;
    const inheritedHint = Object.create({ simplification: role.simplification }) as typeof role;
    Object.assign(inheritedHint, { ...role });
    delete (inheritedHint as { simplification?: string }).simplification;
    Object.setPrototypeOf(inheritedHint, { simplification: "Stay on roots if the chorus entrance gets muddy." });
    section.roles = [inheritedHint];
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithSimplification();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstSimplification(song)).toBeNull();
  });
});
