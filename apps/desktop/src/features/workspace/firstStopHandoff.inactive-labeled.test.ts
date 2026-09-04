import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

describe("resolveFirstStopHandoff inactive labeled holder", () => {
  it("does not name an inactive labeled role as the stop holder", () => {
    const song = createDemoRehearsalSong();
    const section = structuredClone(song.sections[0]!);
    section.id = "stop-1";
    section.label = "stop";
    section.timeRange = { start: 18, end: 19 };
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

    const stop = resolveFirstStopHandoff(song);
    expect(stop?.section.id).toBe("stop-1");
    expect(stop?.holdingRole).toBeNull();
  });
});
