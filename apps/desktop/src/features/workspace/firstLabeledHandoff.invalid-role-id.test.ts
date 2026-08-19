import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

describe("resolveFirstLabeledHandoff runtime role identity", () => {
  it("ignores an active handoff role whose runtime id is not a non-empty string", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "handoff-1";
    section.label = "handoff";
    section.timeRange = { start: 22, end: 24 };

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

    expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
    expect(resolveFirstLabeledHandoff(song)?.holdingRole?.id).toBe("safe-vocal");
  });

  it("does not surface a malformed runtime role name as the holding part", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "handoff-1";
    section.label = "handoff";
    section.timeRange = { start: 22, end: 24 };
    section.roles = [
      {
        ...section.roles[0]!,
        id: "malformed-name",
        name: { unsafe: "object" } as unknown as string,
        rehearsalPriority: "high"
      }
    ];
    section.partGraph = [
      {
        role_id: "malformed-name",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [section];

    expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
    expect(resolveFirstLabeledHandoff(song)?.holdingRole).toBeNull();
  });
});
