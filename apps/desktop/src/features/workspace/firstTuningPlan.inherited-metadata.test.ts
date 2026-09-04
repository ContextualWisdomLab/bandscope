import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTuningPlan } from "./firstTuningPlan";

function songWithTuningPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "tuning-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      tuningPlan: "Tune the E string down to D so the verse riff sits on the open fifth."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstTuningPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithTuningPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstTuningPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithTuningPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithTuningPlan();
    Object.defineProperty(section.roles[0]!, "tuningPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile tuningPlan getter");
      }
    });

    expect(() => resolveFirstTuningPlan(song)).not.toThrow();
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable tuning-plan identity authority", () => {
    const { song, section } = songWithTuningPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "tuning-own";
      }
    });

    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("does not let inherited tuning plans establish the named copy", () => {
    const { song, section } = songWithTuningPlan();
    const inheritedRole = Object.create({
      tuningPlan: "Inherited tuning plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "bass-guitar" },
      name: { configurable: true, enumerable: true, value: "Bass Guitar" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithTuningPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("rejects section labels outside the shared form vocabulary", () => {
    const { song, section } = songWithTuningPlan();
    Object.defineProperty(section, "label", {
      configurable: true,
      enumerable: true,
      value: "verse-legacy"
    });

    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithTuningPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });
});
