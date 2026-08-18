import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstDropoutHandoff } from "./firstDropoutHandoff";

describe("resolveFirstDropoutHandoff runtime role identity", () => {
  it("ignores a handoff source whose runtime role id is not a non-empty string", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);

    const malformedSource = {
      ...section.roles[0]!,
      id: 42 as unknown as string,
      name: "Malformed Runtime Source",
      rehearsalPriority: "high" as const
    };
    const safeSource = {
      ...section.roles[1]!,
      id: "safe-keys",
      name: "Safe Keys",
      rehearsalPriority: "medium" as const
    };
    const receiver = {
      ...section.roles[2]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const
    };

    section.roles = [malformedSource, safeSource, receiver];
    section.partGraph = [
      {
        role_id: 42 as unknown as string,
        is_active: true,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      },
      {
        role_id: "safe-keys",
        is_active: true,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      },
      {
        role_id: "lead-vocal",
        is_active: false,
        handoff_to: [],
        handoff_from: [42 as unknown as string, "safe-keys"]
      }
    ];
    song.sections = [section];

    expect(resolveFirstDropoutHandoff(song)?.fromRole.id).toBe("safe-keys");
  });
});
