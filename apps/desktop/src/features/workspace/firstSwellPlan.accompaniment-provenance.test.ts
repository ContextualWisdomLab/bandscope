import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstSwellPlan } from "./firstSwellPlan";

const MODEL_SWELL_PLAN = "Swell this part; grow into the next downbeat.";

describe("resolveFirstSwellPlan accompaniment provenance", () => {
  it("does not name a shared accompaniment role from persisted swell metadata", () => {
    const song = createDemoRehearsalSong();
    const template = structuredClone(song.sections[0]!);
    const bass = structuredClone(template.roles.find((role) => role.id === "bass-guitar")!);
    const keys = structuredClone(template.roles.find((role) => role.id === "keys-right")!);
    const vocal = structuredClone(template.roles.find((role) => role.id === "lead-vocal")!);

    for (const role of [bass, keys, vocal]) {
      delete (role as { swellPlan?: string }).swellPlan;
      delete (role as { swellPlanSource?: string }).swellPlanSource;
    }
    keys.swellPlan = MODEL_SWELL_PLAN;
    keys.swellPlanSource = "model";

    const previous = structuredClone(template);
    previous.id = "verse-hold";
    previous.label = "verse";
    previous.timeRange = { start: 0, end: 10 };
    previous.roles = [structuredClone(bass), structuredClone(keys), structuredClone(vocal)];
    previous.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    const swell = structuredClone(template);
    swell.id = "chorus-swell";
    swell.label = "chorus";
    swell.timeRange = { start: 10, end: 30 };
    swell.roles = [structuredClone(bass), structuredClone(keys), structuredClone(vocal)];
    swell.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    song.sections = [previous, swell];

    expect(resolveFirstSwellPlan(song)).toBeNull();
  });
});
