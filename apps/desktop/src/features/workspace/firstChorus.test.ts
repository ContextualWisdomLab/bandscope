import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatChorusTime, resolveFirstChorus } from "./firstChorus";

function withChorusSection(
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
  const chorus = structuredClone(verse);
  chorus.id = overrides.id ?? "chorus-1";
  chorus.label = "chorus";
  chorus.timeRange = { start: overrides.start ?? 30, end: overrides.end ?? 46 };
  const roleId = overrides.roleId ?? "lead-vocal";
  chorus.roles = [
    {
      ...verse.roles[2]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  chorus.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, chorus];
  return song;
}

describe("resolveFirstChorus", () => {
  it("returns null when the demo song has no labeled chorus", () => {
    expect(resolveFirstChorus(createDemoRehearsalSong())).toBeNull();
    expect(formatChorusTime(Number.NaN)).toBe("0:00");
    expect(formatChorusTime(-4)).toBe("0:00");
  });

  it("does not invent a chorus from a verse, pre-chorus, pickup, stop, or handoff", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const preChorus = structuredClone(verse);
    preChorus.id = "pre-chorus-1";
    preChorus.label = "pre-chorus";
    preChorus.timeRange = { start: 20, end: 28 };
    const pickup = structuredClone(verse);
    pickup.id = "pickup-1";
    pickup.label = "pickup";
    pickup.timeRange = { start: 8, end: 10 };
    const stop = structuredClone(verse);
    stop.id = "stop-1";
    stop.label = "stop";
    stop.timeRange = { start: 18, end: 19 };
    const handoff = structuredClone(verse);
    handoff.id = "handoff-1";
    handoff.label = "handoff";
    handoff.timeRange = { start: 22, end: 24 };
    song.sections = [verse, pickup, stop, preChorus, handoff];

    expect(resolveFirstChorus(song)).toBeNull();
  });

  it("picks the earliest labeled chorus and the part that carries the lift", () => {
    const song = withChorusSection({ start: 30, end: 46 });
    const chorus = resolveFirstChorus(song);

    expect(chorus?.section.id).toBe("chorus-1");
    expect(chorus?.holdingRole?.id).toBe("lead-vocal");
    expect(chorus?.atSeconds).toBe(30);
    expect(formatChorusTime(chorus?.atSeconds ?? -1)).toBe("0:30");
  });

  it("prefers the earlier of two labeled choruses", () => {
    const song = withChorusSection({ id: "chorus-late", start: 80, end: 96 });
    const verse = song.sections[0]!;
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "chorus-early";
    earlier.timeRange = { start: 30, end: 46 };
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

    const chorus = resolveFirstChorus(song);
    expect(chorus?.section.id).toBe("chorus-early");
    expect(chorus?.holdingRole?.id).toBe("bass-guitar");
    expect(chorus?.atSeconds).toBe(30);
  });

  it("keeps a band-wide lift when no active ranked role holds it", () => {
    const song = withChorusSection({ isActive: false });
    const chorus = resolveFirstChorus(song);
    expect(chorus?.section.id).toBe("chorus-1");
    expect(chorus?.holdingRole).toBeNull();
    expect(chorus?.atSeconds).toBe(30);
  });

  it("skips a chorus whose rehearsal window is unbounded", () => {
    const song = withChorusSection({ start: Number.NaN, end: 46 });
    expect(resolveFirstChorus(song)).toBeNull();
  });

  it("skips a chorus whose end precedes its start", () => {
    const song = withChorusSection({ start: 46, end: 30 });
    expect(resolveFirstChorus(song)).toBeNull();
  });

  it("skips a zero-length chorus window", () => {
    const song = withChorusSection({ start: 30, end: 30 });
    expect(resolveFirstChorus(song)).toBeNull();
  });

  it("skips a chorus whose endpoint overflows the shared timing bound", () => {
    const song = withChorusSection({ start: MAX_SECTION_TIME_SECONDS, end: MAX_SECTION_TIME_SECONDS + 1 });
    expect(resolveFirstChorus(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstChorus(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withChorusSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstChorus(song)).toBeNull();
  });

  it("keeps the lift band-wide when role identities are duplicated", () => {
    const song = withChorusSection();
    const role = song.sections[1]!.roles[0]!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const chorus = resolveFirstChorus(song);
    expect(chorus?.section.id).toBe("chorus-1");
    expect(chorus?.holdingRole).toBeNull();
  });
});
