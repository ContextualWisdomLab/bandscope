import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

const runtimeStringFalse = "false" as unknown as boolean;

describe("resolveFirstPickupHandoff activity-type authority", () => {
  it("does not treat a string false flag as an active labeled pickup receiver", () => {
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

    expect(resolveFirstPickupHandoff(song)?.toRole.id).toBe("active-bass");
  });

  it("does not treat a string false flag as an active labeled pickup source", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "pickup-1";
    section.label = "pickup";
    section.timeRange = { start: 8, end: 10 };
    section.roles = [
      {
        ...section.roles[0]!,
        id: "resting-bass",
        name: "Resting Bass",
        rehearsalPriority: "medium"
      },
      {
        ...section.roles[2]!,
        id: "pickup-vocal",
        name: "Pickup Vocal",
        rehearsalPriority: "high"
      }
    ];
    section.partGraph = [
      {
        role_id: "resting-bass",
        is_active: runtimeStringFalse,
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
  });

  it("does not treat a string false flag as an active generic handoff source", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    section.partGraph = section.partGraph.map((node) =>
      node.role_id === "bass-guitar" ? { ...node, is_active: runtimeStringFalse } : node
    );

    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });
});
