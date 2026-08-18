import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

describe("resolveFirstPickupHandoff labeled pickup receiver authority", () => {
  it("does not announce an inactive higher-priority role as the labeled pickup", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "pickup-1";
    section.label = "pickup";
    section.timeRange = { start: 8, end: 10 };
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

    const pickup = resolveFirstPickupHandoff(song);

    expect(pickup?.toRole.id).toBe("active-bass");
    expect(pickup?.fromRole).toBeNull();
    expect(pickup?.atSeconds).toBe(8);
  });
});
