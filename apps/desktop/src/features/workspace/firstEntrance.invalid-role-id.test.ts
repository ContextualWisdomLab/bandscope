import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstEntrance } from "./firstEntrance";

describe("resolveFirstEntrance runtime role identity", () => {
  it("ignores an active role whose runtime id is not a non-empty string", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);

    const safeRole = {
      ...section.roles[0]!,
      id: "safe-bass",
      name: "Safe Bass",
      rehearsalPriority: "medium" as const
    };
    const malformedRole = {
      ...section.roles[2]!,
      id: 42 as unknown as string,
      name: "Malformed Runtime Role",
      rehearsalPriority: "high" as const
    };

    section.roles = [safeRole, malformedRole];
    section.partGraph = [
      {
        role_id: "safe-bass",
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

    expect(resolveFirstEntrance(song)?.role.id).toBe("safe-bass");
  });
});
