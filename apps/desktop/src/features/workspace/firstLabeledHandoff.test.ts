import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatHandoffTime, resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

function withHandoffSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const handoff = structuredClone(verse);
  handoff.id = overrides.id ?? "handoff-1";
  handoff.label = "handoff";
  handoff.timeRange = { start: overrides.start ?? 22, end: overrides.end ?? 24 };
  const roleId = overrides.roleId ?? "lead-vocal";
  handoff.roles = [
    {
      ...verse.roles[2]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  handoff.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, handoff];
  return song;
}

describe("resolveFirstLabeledHandoff", () => {
  it("returns null when the demo song has no labeled handoff", () => {
    expect(resolveFirstLabeledHandoff(createDemoRehearsalSong())).toBeNull();
    expect(formatHandoffTime(Number.NaN)).toBe("0:00");
    expect(formatHandoffTime(-4)).toBe("0:00");
  });

  it("does not invent a handoff from a stop, pickup, or graph edge on another form label", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const stop = structuredClone(verse);
    stop.id = "stop-1";
    stop.label = "stop";
    stop.timeRange = { start: 18, end: 19 };
    const pickup = structuredClone(verse);
    pickup.id = "pickup-1";
    pickup.label = "pickup";
    pickup.timeRange = { start: 8, end: 10 };
    verse.partGraph = [
      {
        role_id: verse.roles[0]!.id,
        is_active: true,
        handoff_to: [verse.roles[1]!.id],
        handoff_from: []
      }
    ];
    song.sections = [verse, pickup, stop];

    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });

  it("picks the earliest labeled handoff and the part that gives the pass", () => {
    const song = withHandoffSection({ start: 22, end: 24 });
    const handoff = resolveFirstLabeledHandoff(song);

    expect(handoff?.section.id).toBe("handoff-1");
    expect(handoff?.holdingRole?.id).toBe("lead-vocal");
    expect(handoff?.atSeconds).toBe(22);
    expect(formatHandoffTime(handoff?.atSeconds ?? -1)).toBe("0:22");
  });

  it("prefers the earlier of two labeled handoffs", () => {
    const song = withHandoffSection({ id: "handoff-late", start: 40, end: 42 });
    const verse = song.sections[0]!;
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "handoff-early";
    earlier.timeRange = { start: 14, end: 16 };
    earlier.roles = [
      {
        ...verse.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium"
      }
    ];
    earlier.partGraph = [
      {
        role_id: "bass-guitar",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [song.sections[0]!, song.sections[1]!, earlier];

    const handoff = resolveFirstLabeledHandoff(song);
    expect(handoff?.section.id).toBe("handoff-early");
    expect(handoff?.holdingRole?.id).toBe("bass-guitar");
    expect(handoff?.atSeconds).toBe(14);
  });

  it("keeps a band-wide pass when no active ranked role holds it", () => {
    const song = withHandoffSection({ isActive: false });
    const handoff = resolveFirstLabeledHandoff(song);
    expect(handoff?.section.id).toBe("handoff-1");
    expect(handoff?.holdingRole).toBeNull();
    expect(handoff?.atSeconds).toBe(22);
  });

  it("skips a handoff whose rehearsal window is unbounded", () => {
    const song = withHandoffSection({ start: Number.NaN, end: 24 });
    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });

  it("skips a handoff whose end precedes its start", () => {
    const song = withHandoffSection({ start: 24, end: 10 });
    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });
});
