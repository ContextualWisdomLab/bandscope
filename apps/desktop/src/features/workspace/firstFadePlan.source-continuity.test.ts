import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstFadePlan } from "./firstFadePlan";

const FADE_PLAN = "Fade this part; let the next downbeat land quieter.";

describe("resolveFirstFadePlan source continuity", () => {
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
      delete (role as { fadePlan?: string }).fadePlan;
      delete (role as { fadePlanSource?: string }).fadePlanSource;
    }
    vocal.fadePlan = FADE_PLAN;
    vocal.fadePlanSource = "model";

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
    current.id = "chorus-fade";
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

    const resolved = resolveFirstFadePlan(song);
    expect(resolved?.sectionId).toBe("chorus-fade");
    expect(resolved?.landingRoleId).toBe("lead-vocal");
    expect(resolved?.fadePlan).toBe(FADE_PLAN);
  });
});
