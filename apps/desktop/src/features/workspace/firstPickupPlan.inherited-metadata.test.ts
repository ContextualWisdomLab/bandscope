import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPickupPlan } from "./firstPickupPlan";

function songWithPickupPlan() {
  const song = createDemoRehearsalSong();
  const section = structuredClone(song.sections[0]!);
  section.id = "pickup-own";
  section.roles = [
    {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high",
      pickupPlan: "Play this pickup with Lead Vocal; land the downbeat together."
    },
    {
      ...section.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "medium"
    }
  ];
  delete section.roles[1]!.pickupPlan;
  delete section.roles[1]!.pickupPlanSource;
  section.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];
  const previous = structuredClone(section);
  previous.id = "pickup-rest";
  previous.label = "intro";
  previous.timeRange = { start: 0, end: section.timeRange.start };
  previous.roles = previous.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  previous.partGraph = previous.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id !== "bass-guitar"
  }));
  song.sections = [previous, section];
  return { song, section, previous };
}

describe("resolveFirstPickupPlan inherited metadata", () => {
  it("rejects a song or section whose required metadata is inherited", () => {
    const { song, section } = songWithPickupPlan();
    const inheritedSong = Object.create({ sections: song.sections }) as typeof song;
    expect(resolveFirstPickupPlan(inheritedSong)).toBeNull();

    const inheritedSection = Object.create(section) as typeof section;
    song.sections = [song.sections[0]!, inheritedSection];
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const { song, section } = songWithPickupPlan();
    section.timeRange = Object.create({ start: 10, end: 30 }) as typeof section.timeRange;
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("contains exceptions from own runtime accessors instead of trusting them", () => {
    const { song, section } = songWithPickupPlan();
    Object.defineProperty(section.roles[0]!, "pickupPlan", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("hostile pickupPlan getter");
      }
    });

    expect(() => resolveFirstPickupPlan(song)).not.toThrow();
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("does not treat own accessors as stable pickup-plan identity authority", () => {
    const { song, section } = songWithPickupPlan();
    Object.defineProperty(section, "id", {
      configurable: true,
      enumerable: true,
      get() {
        return "pickup-own";
      }
    });

    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("does not let inherited pickup plans establish the named copy", () => {
    const { song, section } = songWithPickupPlan();
    const inheritedRole = Object.create({
      pickupPlan: "Inherited pickup plan"
    }) as (typeof section.roles)[0];
    Object.defineProperties(inheritedRole, {
      id: { configurable: true, enumerable: true, value: "lead-vocal" },
      name: { configurable: true, enumerable: true, value: "Lead Vocal" },
      rehearsalPriority: { configurable: true, enumerable: true, value: "high" }
    });
    section.roles = [inheritedRole];
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the landing part", () => {
    const { song, section } = songWithPickupPlan();
    const node = section.partGraph[0]!;
    section.partGraph = [Object.create(node) as typeof node];
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const { song, section } = songWithPickupPlan();
    const arraySection = Object.assign([], section) as unknown as typeof section;
    song.sections = [song.sections[0]!, arraySection];
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });
});
