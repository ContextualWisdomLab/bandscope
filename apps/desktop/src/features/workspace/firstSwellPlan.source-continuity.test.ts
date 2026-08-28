import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstSwellPlan } from "./firstSwellPlan";

const SWELL_PLAN = "Swell this part; grow into the next downbeat.";

describe("resolveFirstSwellPlan source continuity", () => {
  it("keeps the shared accompaniment source across a keys-to-guitar role swap", () => {
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const bass = structuredClone(seed.roles.find((role) => role.id === "bass-guitar")!);
    const keys = structuredClone(seed.roles.find((role) => role.id === "keys-right")!);
    const guitar = structuredClone(keys);
    guitar.id = "acoustic-guitar";
    guitar.name = "Acoustic Guitar";
    const vocal = structuredClone(seed.roles.find((role) => role.id === "lead-vocal")!);

    for (const role of [bass, keys, guitar, vocal]) {
      delete (role as { swellPlan?: string }).swellPlan;
      delete (role as { swellPlanSource?: string }).swellPlanSource;
    }
    vocal.swellPlan = SWELL_PLAN;
    vocal.swellPlanSource = "model";

    const previous = structuredClone(seed);
    previous.id = "verse-hold";
    previous.label = "verse";
    previous.timeRange = { start: 0, end: 10 };
    previous.roles = [bass, keys, vocal];
    previous.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "acoustic-guitar", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    const current = structuredClone(seed);
    current.id = "chorus-swell";
    current.label = "chorus";
    current.timeRange = { start: 10, end: 30 };
    current.roles = [bass, guitar, vocal];
    current.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "acoustic-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    song.sections = [previous, current];

    const resolved = resolveFirstSwellPlan(song);
    expect(resolved?.sectionId).toBe("chorus-swell");
    expect(resolved?.landingRoleId).toBe("lead-vocal");
    expect(resolved?.swellPlan).toBe(SWELL_PLAN);
  });
});
