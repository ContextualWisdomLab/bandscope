import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstSetupNote } from "./firstSetupNote";

function songWithSetupNote() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "setup-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      setupNote: "Keep the attack short so the verse breathes."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstSetupNote inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithSetupNote();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstSetupNote(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithSetupNote();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithSetupNote();
    Object.defineProperty(section.roles[0]!, "setupNote", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile setupNote getter");
      }
    });

    expect(() => resolveFirstSetupNote(song)).not.toThrow();
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("does not treat own accessors as stable setup-note identity authority", () => {
    const { song, section } = songWithSetupNote();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "setup-own";
      }
    });

    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("does not let inherited setup notes establish the named copy", () => {
    const { song, section } = songWithSetupNote();
    const inheritedRole = Object.create({
      setupNote: "Inherited setup note"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithSetupNote();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithSetupNote();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstSetupNote(song)).toBeNull();
  });
});
