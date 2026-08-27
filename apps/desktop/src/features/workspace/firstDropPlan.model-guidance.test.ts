import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { resolveFirstDropPlan } from "./firstDropPlan";

it("rejects non-template model drop guidance instead of rendering untranslated copy", () => {
  const song = createDemoRehearsalSong();
  const seed = song.sections[0]!;
  const bass = structuredClone(seed.roles.find((role) => role.id === "bass-guitar")!);
  const keys = structuredClone(seed.roles.find((role) => role.id === "keys-right")!);
  const vocal = structuredClone(seed.roles.find((role) => role.id === "lead-vocal")!);

  const previous = structuredClone(seed);
  previous.id = "verse-thin";
  previous.label = "verse";
  previous.timeRange = { start: 0, end: 10 };
  previous.roles = [bass, keys];
  previous.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
  ];

  const current = structuredClone(seed);
  current.id = "chorus-drop";
  current.label = "chorus";
  current.timeRange = { start: 10, end: 30 };
  vocal.dropPlan = "Model says: hit the chorus hard.";
  vocal.dropPlanSource = "model";
  current.roles = [vocal, bass, keys];
  current.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
  ];

  song.sections = [previous, current];

  expect(resolveFirstDropPlan(song)).toBeNull();
});
