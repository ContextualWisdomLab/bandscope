import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstDropPlan } from "./firstDropPlan";

const DROP_PLAN = "Hit this drop; come in together when the texture fills.";

describe("resolveFirstDropPlan source continuity", () => {
  it("keeps the shared accompaniment source across a keys-to-guitar role swap", () => {
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const bass = structuredClone(seed.roles.find((role) => role.id === "bass-guitar")!);
    const keys = structuredClone(seed.roles.find((role) => role.id === "keys-right")!);
    const guitar = structuredClone(seed.roles.find((role) => role.id === "acoustic-guitar")!);
    const vocal = structuredClone(seed.roles.find((role) => role.id === "lead-vocal")!);

    for (const role of [bass, keys, guitar, vocal]) {
      delete (role as { dropPlan?: string }).dropPlan;
      delete (role as { dropPlanSource?: string }).dropPlanSource;
    }
    vocal.dropPlan = DROP_PLAN;
    vocal.dropPlanSource = "model";

    const previous = structuredClone(seed);
    previous.id = "verse-thin";
    previous.label = "verse";
    previous.timeRange = { start: 0, end: 10 };
    previous.roles = [bass, keys];
    previous.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "acoustic-guitar", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];

    const current = structuredClone(seed);
    current.id = "chorus-drop";
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

    const resolved = resolveFirstDropPlan(song);
    expect(resolved?.sectionId).toBe("chorus-drop");
    expect(resolved?.landingRoleId).toBe("lead-vocal");
    expect(resolved?.dropPlan).toBe(DROP_PLAN);
  });
});
