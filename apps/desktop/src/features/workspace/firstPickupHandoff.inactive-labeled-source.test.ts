import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

describe("resolveFirstPickupHandoff labeled pickup authority", () => {
  it("does not name an inactive outgoing role as the source of a labeled pickup", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "pickup-1";
    section.label = "pickup";
    section.timeRange = { start: 8, end: 10 };
    section.roles = [
      {
        ...section.roles[0]!,
        id: "resting-bass",
        name: "Bass Guitar",
        rehearsalPriority: "medium"
      },
      {
        ...section.roles[2]!,
        id: "pickup-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "high"
      }
    ];
    section.partGraph = [
      {
        role_id: "resting-bass",
        is_active: false,
        handoff_to: ["pickup-vocal"],
        handoff_from: []
      },
      {
        role_id: "pickup-vocal",
        is_active: true,
        handoff_to: [],
        handoff_from: ["resting-bass"]
      }
    ];
    song.sections = [section];

    const pickup = resolveFirstPickupHandoff(song);

    expect(pickup?.toRole.id).toBe("pickup-vocal");
    expect(pickup?.fromRole).toBeNull();
    expect(pickup?.atSeconds).toBe(8);
  });
});
