import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPadPlan } from "./firstPadPlan";

function songWithPadPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "pad-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      padPlan: "Drop to a two-bar pad so the Keyboard 1 Right Hand run can land."
    }
  ];
  section.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
  song.sections = [section];
  return { song, section };
}

describe("resolveFirstPadPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithPadPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstPadPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [inheritedSection];
    expect(resolveFirstPadPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithPadPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstPadPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithPadPlan();
    Object.defineProperty(section.roles[0]!, "padPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile padPlan getter");
      }
    });

    expect(() => resolveFirstPadPlan(song)).not.toThrow();
    expect(resolveFirstPadPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable pad-plan identity authority", () => {
    const { song, section } = songWithPadPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "pad-own";
      }
    });

    expect(resolveFirstPadPlan(song)).toBeNull();
  });

  it("does not let inherited pad plans establish the named copy", () => {
    const { song, section } = songWithPadPlan();
    const inheritedRole = Object.create({
      padPlan: "Inherited pad plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstPadPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the holding part", () => {
    const { song, section } = songWithPadPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstPadPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithPadPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [arraySection];
    expect(resolveFirstPadPlan(song)).toBeNull();
  });
});
