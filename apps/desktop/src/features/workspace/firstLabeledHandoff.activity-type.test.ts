import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

const runtimeStringFalse = "false" as unknown as boolean;

describe("resolveFirstLabeledHandoff activity-type authority", () => {
  it("does not treat a string false flag as an active handoff holder", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "handoff-1";
    section.label = "handoff";
    section.timeRange = { start: 22, end: 24 };
    section.roles = [
      {
        ...section.roles[2]!,
        id: "resting-vocal",
        name: "Resting Vocal",
        rehearsalPriority: "high"
      },
      {
        ...section.roles[0]!,
        id: "active-bass",
        name: "Active Bass",
        rehearsalPriority: "medium"
      }
    ];
    section.partGraph = [
      {
        role_id: "resting-vocal",
        is_active: runtimeStringFalse,
        handoff_to: [],
        handoff_from: []
      },
      {
        role_id: "active-bass",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [section];

    expect(resolveFirstLabeledHandoff(song)?.holdingRole?.id).toBe("active-bass");
  });
});
