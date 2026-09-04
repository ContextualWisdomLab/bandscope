import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

describe("resolveFirstLabeledHandoff inactive labeled holder", () => {
  it("does not name an inactive labeled role as the handoff holder", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "handoff-1";
    section.label = "handoff";
    section.timeRange = { start: 22, end: 24 };
    section.roles = [
      {
        ...section.roles[2]!,
        id: "resting-vocal",
        name: "Resting Vocal",
        rehearsalPriority: "high"
      }
    ];
    section.partGraph = [
      {
        role_id: "resting-vocal",
        is_active: false,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [section];

    const handoff = resolveFirstLabeledHandoff(song);
    expect(handoff?.section.id).toBe("handoff-1");
    expect(handoff?.holdingRole).toBeNull();
  });
});
