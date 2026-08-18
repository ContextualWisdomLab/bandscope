import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstEntrance } from "./firstEntrance";

describe("resolveFirstEntrance active-part authority", () => {
  it("does not announce a higher-priority role that is inactive in the entrance section", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    const inactiveLead = {
      ...section.roles[2]!,
      id: "resting-lead",
      rehearsalPriority: "high" as const
    };
    const activeBass = {
      ...section.roles[0]!,
      id: "active-bass",
      rehearsalPriority: "medium" as const
    };

    section.roles = [inactiveLead, activeBass];
    section.partGraph = [
      {
        role_id: "resting-lead",
        is_active: false,
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

    expect(resolveFirstEntrance(song)?.role.id).toBe("active-bass");
  });
});
