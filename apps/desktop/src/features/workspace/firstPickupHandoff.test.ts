import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatPickupTime, resolveFirstPickupHandoff } from "./firstPickupHandoff";

describe("resolveFirstPickupHandoff", () => {
  it("picks the incoming catch of the earliest explicit handoff", () => {
    const song = createDemoRehearsalSong();
    const pickup = resolveFirstPickupHandoff(song);

    expect(pickup?.section.id).toBe("verse-1");
    expect(pickup?.fromRole?.id).toBe("bass-guitar");
    expect(pickup?.toRole.id).toBe("lead-vocal");
    expect(pickup?.atSeconds).toBe(30);
    expect(formatPickupTime(pickup?.atSeconds ?? -1)).toBe("0:30");
    expect(formatPickupTime(Number.NaN)).toBe("0:00");
  });

  it("returns null when no part is ready to pick up", () => {
    const song = createDemoRehearsalSong();
    song.sections = [];
    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });

  it("prefers an explicit pickup section over a later incoming handoff", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const pickupSection = structuredClone(verse);
    pickupSection.id = "pickup-1";
    pickupSection.label = "pickup";
    pickupSection.timeRange = { start: 8, end: 10 };
    pickupSection.roles = [
      {
        ...verse.roles[2]!,
        id: "lead-vocal-pickup",
        name: "Lead Vocal",
        rehearsalPriority: "high"
      }
    ];
    pickupSection.partGraph = [
      {
        role_id: "lead-vocal-pickup",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [verse, pickupSection];

    const pickup = resolveFirstPickupHandoff(song);
    expect(pickup?.section.id).toBe("pickup-1");
    expect(pickup?.toRole.id).toBe("lead-vocal-pickup");
    expect(pickup?.fromRole).toBeNull();
    expect(pickup?.atSeconds).toBe(8);
  });

  it("keeps a labeled pickup's incoming partner when the graph corroborates it", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const pickupSection = structuredClone(verse);
    pickupSection.id = "pickup-1";
    pickupSection.label = "pickup";
    pickupSection.timeRange = { start: 8, end: 10 };
    pickupSection.roles = [
      {
        ...verse.roles[0]!,
        id: "bass-pickup",
        name: "Bass Guitar",
        rehearsalPriority: "medium"
      },
      {
        ...verse.roles[2]!,
        id: "vocal-pickup",
        name: "Lead Vocal",
        rehearsalPriority: "high"
      }
    ];
    pickupSection.partGraph = [
      {
        role_id: "bass-pickup",
        is_active: true,
        handoff_to: ["vocal-pickup"],
        handoff_from: []
      },
      {
        role_id: "vocal-pickup",
        is_active: true,
        handoff_to: [],
        handoff_from: ["bass-pickup"]
      }
    ];
    song.sections = [pickupSection];

    const pickup = resolveFirstPickupHandoff(song);
    expect(pickup?.toRole.id).toBe("vocal-pickup");
    expect(pickup?.fromRole?.id).toBe("bass-pickup");
    expect(pickup?.atSeconds).toBe(8);
  });

  it("skips an earlier section that only has inactive or empty handoff lists", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const later = structuredClone(verse);
    later.id = "chorus-1";
    later.label = "chorus";
    later.timeRange = { start: 40, end: 70 };
    later.roles = [
      {
        ...verse.roles[0]!,
        id: "bass-guitar-chorus",
        name: "Bass Guitar"
      },
      {
        ...verse.roles[2]!,
        id: "lead-vocal-chorus",
        name: "Lead Vocal"
      }
    ];
    later.partGraph = [
      {
        role_id: "bass-guitar-chorus",
        is_active: true,
        handoff_to: ["lead-vocal-chorus"],
        handoff_from: []
      },
      {
        role_id: "lead-vocal-chorus",
        is_active: false,
        handoff_to: [],
        handoff_from: ["bass-guitar-chorus"]
      }
    ];
    song.sections = [
      {
        ...verse,
        partGraph: [
          {
            role_id: "bass-guitar",
            is_active: false,
            handoff_to: ["lead-vocal"],
            handoff_from: []
          },
          {
            role_id: "keys-right",
            is_active: true,
            handoff_to: [],
            handoff_from: []
          }
        ]
      },
      later
    ];

    const pickup = resolveFirstPickupHandoff(song);
    expect(pickup?.section.id).toBe("chorus-1");
    expect(pickup?.fromRole?.id).toBe("bass-guitar-chorus");
    expect(pickup?.toRole.id).toBe("lead-vocal-chorus");
    expect(pickup?.atSeconds).toBe(70);
  });

  it("does not resolve a section pickup against a role that exists only in another section", () => {
    const song = createDemoRehearsalSong();
    const verse = structuredClone(song.sections[0]!);
    verse.partGraph = [
      {
        role_id: "bass-guitar",
        is_active: true,
        handoff_to: ["future-lead"],
        handoff_from: []
      }
    ];

    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 70 };
    chorus.roles = [
      {
        ...chorus.roles[0]!,
        id: "chorus-bass",
        rehearsalPriority: "medium"
      },
      {
        ...chorus.roles[2]!,
        id: "future-lead",
        rehearsalPriority: "high"
      }
    ];
    chorus.partGraph = [
      {
        role_id: "chorus-bass",
        is_active: true,
        handoff_to: ["future-lead"],
        handoff_from: []
      },
      {
        role_id: "future-lead",
        is_active: false,
        handoff_to: [],
        handoff_from: ["chorus-bass"]
      }
    ];
    song.sections = [verse, chorus];

    const pickup = resolveFirstPickupHandoff(song);
    expect(pickup?.section.id).toBe("chorus-1");
    expect(pickup?.fromRole?.id).toBe("chorus-bass");
    expect(pickup?.toRole.id).toBe("future-lead");
  });

  it("rejects an outgoing handoff that the target node does not corroborate", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    verse.partGraph = verse.partGraph.map((node) =>
      node.role_id === "lead-vocal" ? { ...node, handoff_from: [] } : node
    );

    expect(resolveFirstPickupHandoff(song)).toBeNull();
  });

  it("accepts a reciprocal receiver that is inactive until the next section", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    verse.partGraph = verse.partGraph.map((node) =>
      node.role_id === "lead-vocal" ? { ...node, is_active: false } : node
    );

    const pickup = resolveFirstPickupHandoff(song);
    expect(pickup?.fromRole?.id).toBe("bass-guitar");
    expect(pickup?.toRole.id).toBe("lead-vocal");
  });

  it("prefers the higher-priority incoming part when two pickups share a section", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    song.sections[0] = {
      ...verse,
      roles: verse.roles.map((role) =>
        role.id === "keys-right" ? { ...role, rehearsalPriority: "low" as const } : role
      ),
      partGraph: [
        {
          role_id: "bass-guitar",
          is_active: true,
          handoff_to: ["keys-right", "lead-vocal"],
          handoff_from: []
        },
        {
          role_id: "keys-right",
          is_active: false,
          handoff_to: [],
          handoff_from: ["bass-guitar"]
        },
        {
          role_id: "lead-vocal",
          is_active: false,
          handoff_to: [],
          handoff_from: ["bass-guitar"]
        }
      ]
    };

    expect(resolveFirstPickupHandoff(song)?.toRole.id).toBe("lead-vocal");
  });

  it("prefers the earlier pickup when a later section also hands off", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const later = structuredClone(verse);
    later.id = "bridge-1";
    later.label = "bridge";
    later.timeRange = { start: 80, end: 100 };
    later.roles = [
      {
        ...verse.roles[1]!,
        id: "keys-bridge",
        name: "Keyboard 1 Right Hand",
        rehearsalPriority: "high"
      },
      {
        ...verse.roles[2]!,
        id: "vocal-bridge",
        name: "Lead Vocal"
      }
    ];
    later.partGraph = [
      {
        role_id: "keys-bridge",
        is_active: true,
        handoff_to: ["vocal-bridge"],
        handoff_from: []
      },
      {
        role_id: "vocal-bridge",
        is_active: false,
        handoff_to: [],
        handoff_from: ["keys-bridge"]
      }
    ];
    song.sections = [verse, later];

    const pickup = resolveFirstPickupHandoff(song);
    expect(pickup?.section.id).toBe("verse-1");
    expect(pickup?.toRole.id).toBe("lead-vocal");
    expect(pickup?.atSeconds).toBe(30);
  });

  it("skips non-finite ends, unknown priorities, missing roles, and self-handoffs", () => {
    const song = createDemoRehearsalSong();
    const invalidEnd = structuredClone(song.sections[0]!);
    invalidEnd.id = "invalid-end";
    invalidEnd.timeRange = { start: 0, end: Number.NaN };
    invalidEnd.partGraph = [
      {
        role_id: "bass-guitar",
        is_active: true,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      }
    ];

    const validSection = structuredClone(song.sections[0]!);
    validSection.id = "valid-chorus";
    validSection.label = "chorus";
    validSection.timeRange = { start: 20, end: 50 };
    const invalidPriorityRole = {
      ...validSection.roles[0]!,
      id: "invalid-priority"
    };
    (invalidPriorityRole as unknown as { rehearsalPriority: string }).rehearsalPriority = "urgent";
    validSection.roles = [
      invalidPriorityRole,
      {
        ...validSection.roles[2]!,
        id: "safe-lead",
        rehearsalPriority: "high"
      },
      {
        ...validSection.roles[0]!,
        id: "safe-bass",
        name: "Bass Guitar",
        rehearsalPriority: "medium"
      }
    ];
    validSection.partGraph = [
      {
        role_id: "missing-role",
        is_active: true,
        handoff_to: ["safe-lead"],
        handoff_from: []
      },
      {
        role_id: "invalid-priority",
        is_active: true,
        handoff_to: ["safe-lead"],
        handoff_from: []
      },
      {
        role_id: "safe-bass",
        is_active: true,
        handoff_to: ["safe-bass", "   ", "nobody", "safe-lead"],
        handoff_from: []
      },
      {
        role_id: "safe-lead",
        is_active: false,
        handoff_to: [],
        handoff_from: ["safe-bass"]
      }
    ];

    song.sections = [invalidEnd, validSection];

    const pickup = resolveFirstPickupHandoff(song);
    expect(pickup?.section.id).toBe("valid-chorus");
    expect(pickup?.fromRole?.id).toBe("safe-bass");
    expect(pickup?.toRole.id).toBe("safe-lead");
    expect(pickup?.atSeconds).toBe(50);
  });
});