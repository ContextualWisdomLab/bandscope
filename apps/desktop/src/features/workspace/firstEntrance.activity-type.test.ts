import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstEntrance } from "./firstEntrance";

const runtimeStringFalse = "false" as unknown as boolean;

describe("resolveFirstEntrance activity-type authority", () => {
  it("does not treat a string false flag as active entrance evidence", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.timeRange = { start: 8, end: 20 };
    section.roles = [
      {
        ...section.roles[2]!,
        id: "resting-lead",
        name: "Resting Lead",
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
        role_id: "resting-lead",
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

    const entrance = resolveFirstEntrance(song);

    expect(entrance?.role.id).toBe("active-bass");
    expect(entrance?.startSeconds).toBe(8);
  });
});
