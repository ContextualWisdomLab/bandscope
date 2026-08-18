import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

describe("resolveFirstStopHandoff runtime role identity", () => {
  it("ignores an active stop role whose runtime id is not a non-empty string", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "stop-1";
    section.label = "stop";
    section.timeRange = { start: 18, end: 19 };

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

    expect(() => resolveFirstStopHandoff(song)).not.toThrow();
    expect(resolveFirstStopHandoff(song)?.holdingRole?.id).toBe("safe-vocal");
  });
});
