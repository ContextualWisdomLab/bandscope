import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstFadePlan } from "./firstFadePlan";

const MODEL_FADE_PLAN = "Fade this part; let the next downbeat land quieter.";

describe("resolveFirstFadePlan accompaniment provenance", () => {
  it("does not name a shared accompaniment role from persisted fade metadata", () => {
    const song = createDemoRehearsalSong();
    const template = structuredClone(song.sections[0]!);
    const bass = structuredClone(template.roles.find((role) => role.id === "bass-guitar")!);
    const keys = structuredClone(template.roles.find((role) => role.id === "keys-right")!);
    const vocal = structuredClone(template.roles.find((role) => role.id === "lead-vocal")!);

    for (const role of [bass, keys, vocal]) {
      delete (role as { fadePlan?: string }).fadePlan;
      delete (role as { fadePlanSource?: string }).fadePlanSource;
    }
    keys.fadePlan = MODEL_FADE_PLAN;
    keys.fadePlanSource = "model";

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

    const fade = structuredClone(template);
    fade.id = "chorus-fade";
    fade.label = "chorus";
    fade.timeRange = { start: 10, end: 30 };
    fade.roles = [structuredClone(bass), structuredClone(keys), structuredClone(vocal)];
    fade.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    song.sections = [previous, fade];

    expect(resolveFirstFadePlan(song)).toBeNull();
  });
});
