import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

function songWithHandoff() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const handoff = structuredClone(verse);
  const role = {
    ...verse.roles[0]!,
    id: "bass-guitar",
    name: "Bass Guitar",
    rehearsalPriority: "high" as const
  };

  handoff.id = "handoff-1";
  handoff.label = "handoff";
  handoff.timeRange = { start: 22, end: 24 };
  handoff.roles = [role];
  handoff.partGraph = [
    {
      role_id: role.id,
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, handoff];
  return { song, handoff, role };
}

describe("resolveFirstLabeledHandoff ambiguous identities", () => {
  it("keeps a band-wide pass when a handoff repeats one role identity", () => {
    const { song, handoff, role } = songWithHandoff();
    handoff.roles = [role, { ...role, name: "Duplicate Bass" }];

    const result = resolveFirstLabeledHandoff(song);

    expect(result?.section).toBe(handoff);
    expect(result?.holdingRole).toBeNull();
  });

  it("keeps a band-wide pass when a handoff repeats one graph-node identity", () => {
    const { song, handoff, role } = songWithHandoff();
    handoff.partGraph = [
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

    const result = resolveFirstLabeledHandoff(song);

    expect(result?.section).toBe(handoff);
    expect(result?.holdingRole).toBeNull();
  });
});
