import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstVoicingPlan } from "./firstVoicingPlan";

function songWithVoicingPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "voicing-own";
  section.roles = [
    {
      ...section.roles[1]!,
      id: "keys-right",
      name: "Keyboard 1 Right Hand",
      rehearsalPriority: "high",
      voicingPlan: "Keep the verse voicing in first inversion so the top line still sings over the guitars."
    }
  ];
  section.partGraph = [{ role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstVoicingPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithVoicingPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstVoicingPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithVoicingPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithVoicingPlan();
    Object.defineProperty(section.roles[0]!, "voicingPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile voicingPlan getter");
      }
    });

    expect(() => resolveFirstVoicingPlan(song)).not.toThrow();
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable voicing-plan identity authority", () => {
    const { song, section } = songWithVoicingPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "voicing-own";
      }
    });

    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("does not let inherited voicing plans establish the named copy", () => {
    const { song, section } = songWithVoicingPlan();
    const inheritedRole = Object.create({
      voicingPlan: "Inherited voicing plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "keys-right" },
      name: { configurable: true, enumerable: true, value: "Keyboard 1 Right Hand" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithVoicingPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithVoicingPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });
});
