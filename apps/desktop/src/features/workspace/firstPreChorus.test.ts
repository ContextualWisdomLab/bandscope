import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatPreChorusTime, resolveFirstPreChorus } from "./firstPreChorus";

function withPreChorusSection(
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
  const seed = song.sections[0]!;
  const preChorus = structuredClone(seed);
  preChorus.id = overrides.id ?? "pre-chorus-1";
  preChorus.label = "pre-chorus";
  preChorus.timeRange = { start: overrides.start ?? 20, end: overrides.end ?? 28 };
  const roleId = overrides.roleId ?? "lead-vocal";
  preChorus.roles = [
    {
      ...seed.roles[2]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  preChorus.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [preChorus];
  return song;
}

describe("resolveFirstPreChorus", () => {
  it("does not invent a pre-chorus from the demo verse", () => {
    expect(resolveFirstPreChorus(createDemoRehearsalSong())).toBeNull();
    expect(formatPreChorusTime(Number.NaN)).toBe("0:00");
    expect(formatPreChorusTime(-4)).toBe("0:00");
  });

  it("does not invent a pre-chorus from an intro, verse, chorus, bridge, outro, tag, pickup, stop, or handoff", () => {
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const intro = structuredClone(seed);
    intro.id = "intro-1";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: 8 };
    const verse = structuredClone(seed);
    verse.id = "verse-1";
    verse.label = "verse";
    verse.timeRange = { start: 10, end: 20 };
    const chorus = structuredClone(seed);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 30, end: 46 };
    const bridge = structuredClone(seed);
    bridge.id = "bridge-1";
    bridge.label = "bridge";
    bridge.timeRange = { start: 64, end: 80 };
    const outro = structuredClone(seed);
    outro.id = "outro-1";
    outro.label = "outro";
    outro.timeRange = { start: 90, end: 102 };
    const tag = structuredClone(seed);
    tag.id = "tag-1";
    tag.label = "tag";
    tag.timeRange = { start: 102, end: 108 };
    const pickup = structuredClone(seed);
    pickup.id = "pickup-1";
    pickup.label = "pickup";
    pickup.timeRange = { start: 8, end: 10 };
    const stop = structuredClone(seed);
    stop.id = "stop-1";
    stop.label = "stop";
    stop.timeRange = { start: 18, end: 19 };
    const handoff = structuredClone(seed);
    handoff.id = "handoff-1";
    handoff.label = "handoff";
    handoff.timeRange = { start: 22, end: 24 };
    song.sections = [intro, pickup, stop, verse, chorus, handoff, bridge, outro, tag];

    expect(resolveFirstPreChorus(song)).toBeNull();
  });

  it("picks the earliest labeled pre-chorus and the part that carries the lift", () => {
    const song = withPreChorusSection({ start: 20, end: 28 });
    const first = resolveFirstPreChorus(song);

    expect(first?.section.id).toBe("pre-chorus-1");
    expect(first?.holdingRole?.id).toBe("lead-vocal");
    expect(first?.atSeconds).toBe(20);
    expect(formatPreChorusTime(first?.atSeconds ?? -1)).toBe("0:20");
  });

  it("prefers the earlier of two labeled pre-choruses", () => {
    const song = withPreChorusSection({ id: "pre-chorus-late", start: 48, end: 56 });
    const seed = song.sections[0]!;
    const earlier = structuredClone(seed);
    earlier.id = "pre-chorus-early";
    earlier.timeRange = { start: 20, end: 28 };
    earlier.roles = [
      {
        ...seed.roles[0]!,
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
    song.sections = [song.sections[0]!, earlier];

    const first = resolveFirstPreChorus(song);
    expect(first?.section.id).toBe("pre-chorus-early");
    expect(first?.holdingRole?.id).toBe("bass-guitar");
    expect(first?.atSeconds).toBe(20);
  });

  it("keeps a band-wide lift when no active ranked role holds it", () => {
    const song = withPreChorusSection({ isActive: false });
    const first = resolveFirstPreChorus(song);
    expect(first?.section.id).toBe("pre-chorus-1");
    expect(first?.holdingRole).toBeNull();
    expect(first?.atSeconds).toBe(20);
  });

  it("skips a pre-chorus whose rehearsal window is unbounded", () => {
    const song = withPreChorusSection({ start: Number.NaN, end: 28 });
    expect(resolveFirstPreChorus(song)).toBeNull();
  });

  it("skips a pre-chorus whose end precedes its start", () => {
    const song = withPreChorusSection({ start: 28, end: 20 });
    expect(resolveFirstPreChorus(song)).toBeNull();
  });

  it("skips a zero-length pre-chorus window", () => {
    const song = withPreChorusSection({ start: 20, end: 20 });
    expect(resolveFirstPreChorus(song)).toBeNull();
  });

  it("skips a pre-chorus whose endpoint overflows the shared timing bound", () => {
    const song = withPreChorusSection({
      start: MAX_SECTION_TIME_SECONDS,
      end: MAX_SECTION_TIME_SECONDS + 1
    });
    expect(resolveFirstPreChorus(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstPreChorus(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withPreChorusSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstPreChorus(song)).toBeNull();
  });

  it("keeps the lift band-wide when role identities are duplicated", () => {
    const song = withPreChorusSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const first = resolveFirstPreChorus(song);
    expect(first?.section.id).toBe("pre-chorus-1");
    expect(first?.holdingRole).toBeNull();
  });

  it("tie-breaks same-start pre-choruses by locale-independent id order", () => {
    const song = withPreChorusSection({ id: "pre-chorus-z", start: 20, end: 28 });
    const earlierId = structuredClone(song.sections[0]!);
    earlierId.id = "pre-chorus-a";
    earlierId.roles = [
      {
        ...song.sections[0]!.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium"
      }
    ];
    earlierId.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections = [song.sections[0]!, earlierId];
    const first = resolveFirstPreChorus(song);
    expect(first?.section.id).toBe("pre-chorus-a");
    expect(first?.holdingRole?.id).toBe("bass-guitar");
  });

  it("skips a pre-chorus whose time range is missing", () => {
    const song = withPreChorusSection();
    (song.sections[0] as unknown as { timeRange: unknown }).timeRange = null;
    expect(resolveFirstPreChorus(song)).toBeNull();
  });

  it("keeps the lift band-wide when roles or graph nodes are not dense objects", () => {
    const song = withPreChorusSection();
    (song.sections[0] as unknown as { roles: unknown }).roles = null;
    expect(resolveFirstPreChorus(song)?.holdingRole).toBeNull();

    const graphSong = withPreChorusSection();
    graphSong.sections[0]!.roles = [
      {
        ...graphSong.sections[0]!.roles[0]!,
        id: "   ",
        name: "",
        rehearsalPriority: "urgent" as never
      }
    ];
    graphSong.sections[0]!.partGraph = [
      { role_id: "   ", is_active: false, handoff_to: [], handoff_from: [] } as never
    ];
    expect(resolveFirstPreChorus(graphSong)?.holdingRole).toBeNull();
  });

  it("formats minute-bounded rehearsal times", () => {
    expect(formatPreChorusTime(70)).toBe("1:10");
  });
});
