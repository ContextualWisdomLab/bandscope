import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstDropPlan } from "./firstDropPlan";

const MODEL_DROP_PLAN = "Hit this drop; come in together when the texture fills.";

describe("resolveFirstDropPlan accompaniment provenance", () => {
  it("does not name a shared accompaniment role from persisted drop metadata", () => {
    const song = createDemoRehearsalSong();
    const template = structuredClone(song.sections[0]!);
    const bass = structuredClone(template.roles.find((role) => role.id === "bass-guitar")!);
    const keys = structuredClone(template.roles.find((role) => role.id === "keys-right")!);
    const vocal = structuredClone(template.roles.find((role) => role.id === "lead-vocal")!);

    for (const role of [bass, keys, vocal]) {
      delete (role as { dropPlan?: string }).dropPlan;
      delete (role as { dropPlanSource?: string }).dropPlanSource;
    }
    keys.dropPlan = MODEL_DROP_PLAN;
    keys.dropPlanSource = "model";

    const thin = structuredClone(template);
    thin.id = "verse-thin";
    thin.label = "verse";
    thin.timeRange = { start: 0, end: 10 };
    thin.roles = [structuredClone(bass), structuredClone(keys), structuredClone(vocal)];
    thin.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];

    const drop = structuredClone(template);
    drop.id = "chorus-drop";
    drop.label = "chorus";
    drop.timeRange = { start: 10, end: 30 };
    drop.roles = [structuredClone(bass), structuredClone(keys), structuredClone(vocal)];
    drop.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    song.sections = [thin, drop];

    expect(resolveFirstDropPlan(song)).toBeNull();
  });
});
