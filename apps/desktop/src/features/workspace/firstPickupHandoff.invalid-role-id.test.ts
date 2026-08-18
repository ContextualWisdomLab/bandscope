import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstPickupHandoff } from "./firstPickupHandoff";

describe("resolveFirstPickupHandoff runtime role identity", () => {
  it("ignores an active pickup role whose runtime id is not a non-empty string", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "pickup-1";
    section.label = "pickup";
    section.timeRange = { start: 8, end: 10 };

    const safeRole = {
      ...section.roles[2]!,
      id: "safe-vocal",
      name: "Safe Vocal",
      rehearsalPriority: "high" as const
    };
    const malformedRole = {
      ...section.roles[0]!,
      id: 42 as unknown as string,
      name: "Malformed Runtime Role",
      rehearsalPriority: "high" as const
    };

    section.roles = [safeRole, malformedRole];
    section.partGraph = [
      {
        role_id: "safe-vocal",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      },
      {
        role_id: 42 as unknown as string,
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [section];

    expect(() => resolveFirstPickupHandoff(song)).not.toThrow();
    expect(resolveFirstPickupHandoff(song)?.toRole.id).toBe("safe-vocal");
  });
});
