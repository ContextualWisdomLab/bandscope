import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

function songWithStop() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const stop = structuredClone(verse);
  const role = {
    ...verse.roles[0]!,
    id: "bass-guitar",
    name: "Bass Guitar",
    rehearsalPriority: "high" as const
  };

  stop.id = "stop-1";
  stop.label = "stop";
  stop.timeRange = { start: 18, end: 19 };
  stop.roles = [role];
  stop.partGraph = [
    {
      role_id: role.id,
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, stop];
  return { song, stop, role };
}

describe("resolveFirstStopHandoff ambiguous identities", () => {
  it("keeps a band-wide cut when a stop repeats one role identity", () => {
    const { song, stop, role } = songWithStop();
    stop.roles = [role, { ...role, name: "Duplicate Bass" }];

    const result = resolveFirstStopHandoff(song);

    expect(result?.section).toBe(stop);
    expect(result?.holdingRole).toBeNull();
  });

  it("keeps a band-wide cut when a stop repeats one graph-node identity", () => {
    const { song, stop, role } = songWithStop();
    stop.partGraph = [
      {
        role_id: role.id,
        is_active: true,
        handoff_to: [],
        handoff_from: []
      },
      {
        role_id: role.id,
        is_active: false,
        handoff_to: [],
        handoff_from: []
      }
    ];

    const result = resolveFirstStopHandoff(song);

    expect(result?.section).toBe(stop);
    expect(result?.holdingRole).toBeNull();
  });
});
