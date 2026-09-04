import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatStopTime, resolveFirstStopHandoff } from "./firstStopHandoff";

function withStopSection(
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
  const stop = structuredClone(verse);
  stop.id = overrides.id ?? "stop-1";
  stop.label = "stop";
  stop.timeRange = { start: overrides.start ?? 18, end: overrides.end ?? 19 };
  const roleId = overrides.roleId ?? "lead-vocal";
  stop.roles = [
    {
      ...verse.roles[2]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  stop.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, stop];
  return song;
}

describe("resolveFirstStopHandoff", () => {
  it("returns null when the demo song has no labeled stop", () => {
    expect(resolveFirstStopHandoff(createDemoRehearsalSong())).toBeNull();
    expect(formatStopTime(Number.NaN)).toBe("0:00");
    expect(formatStopTime(-4)).toBe("0:00");
  });

  it("picks the earliest labeled stop and the part that holds the cut", () => {
    const song = withStopSection({ start: 18, end: 19 });
    const stop = resolveFirstStopHandoff(song);

    expect(stop?.section.id).toBe("stop-1");
    expect(stop?.holdingRole?.id).toBe("lead-vocal");
    expect(stop?.atSeconds).toBe(18);
    expect(formatStopTime(stop?.atSeconds ?? -1)).toBe("0:18");
  });

  it("prefers the earlier of two labeled stops", () => {
    const song = withStopSection({ id: "stop-late", start: 40, end: 41 });
    const verse = song.sections[0]!;
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "stop-early";
    earlier.timeRange = { start: 12, end: 13 };
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

    const stop = resolveFirstStopHandoff(song);
    expect(stop?.section.id).toBe("stop-early");
    expect(stop?.holdingRole?.id).toBe("bass-guitar");
    expect(stop?.atSeconds).toBe(12);
  });

  it("keeps a band-wide cut when no active ranked role holds it", () => {
    const song = withStopSection({ isActive: false });
    const stop = resolveFirstStopHandoff(song);
    expect(stop?.section.id).toBe("stop-1");
    expect(stop?.holdingRole).toBeNull();
    expect(stop?.atSeconds).toBe(18);
  });

  it("skips a stop whose rehearsal window is unbounded", () => {
    const song = withStopSection({ start: Number.NaN, end: 19 });
    expect(resolveFirstStopHandoff(song)).toBeNull();
  });

  it("skips a stop whose end precedes its start", () => {
    const song = withStopSection({ start: 20, end: 10 });
    expect(resolveFirstStopHandoff(song)).toBeNull();
  });
});
