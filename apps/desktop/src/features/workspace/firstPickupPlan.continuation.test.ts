import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstPickupPlan } from "./firstPickupPlan";

describe("resolveFirstPickupPlan landing authority", () => {
  it("does not name a pickup when the landing role is the only source on the downbeat", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    const landingRole = verse.roles.find((role) => role.id === "bass-guitar")!;
    landingRole.pickupPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    verse.roles = [landingRole];
    verse.partGraph = verse.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === landingRole.id
    }));

    const intro = structuredClone(verse);
    intro.id = "intro-lone";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: verse.timeRange.start };
    intro.roles = intro.roles.map((role) => {
      const clone = { ...role };
      delete clone.pickupPlan;
      delete clone.pickupPlanSource;
      return clone;
    });
    intro.partGraph = intro.partGraph.map((node) => ({ ...node, is_active: false }));
    song.sections = [intro, verse];

    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("does not name a pickup when the rest and landing windows leave a gap", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    verse.roles[0]!.pickupPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    const intro = structuredClone(verse);
    intro.id = "intro-gap";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: verse.timeRange.start - 1 };
    intro.roles = intro.roles.map((role) => {
      const clone = { ...role };
      delete clone.pickupPlan;
      delete clone.pickupPlanSource;
      return clone;
    });
    intro.partGraph = intro.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id !== "bass-guitar"
    }));
    song.sections = [intro, verse];

    expect(resolveFirstPickupPlan(song)).toBeNull();
  });
});
