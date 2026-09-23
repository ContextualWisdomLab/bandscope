import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatVerseTime, resolveFirstVerse } from "./firstVerse";

function withVerseSection(
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
  const verse = structuredClone(seed);
  verse.id = overrides.id ?? "verse-1";
  verse.label = "verse";
  verse.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "lead-vocal";
  verse.roles = [
    {
      ...seed.roles[2]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  verse.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse];
  return song;
}

describe("resolveFirstVerse", () => {
  it("picks the labeled verse already on the demo song and the part that carries it", () => {
    const first = resolveFirstVerse(createDemoRehearsalSong());
    expect(first?.section.id).toBe("verse-1");
    expect(first?.holdingRole?.id).toBe("bass-guitar");
    expect(first?.atSeconds).toBe(10);
    expect(formatVerseTime(first?.atSeconds ?? -1)).toBe("0:10");
    expect(formatVerseTime(Number.NaN)).toBe("0:00");
    expect(formatVerseTime(-4)).toBe("0:00");
  });

  it("does not invent a verse from an intro, pre-chorus, chorus, bridge, outro, tag, pickup, stop, or handoff", () => {
    const song = createDemoRehearsalSong();
    const seed = song.sections[0]!;
    const intro = structuredClone(seed);
    intro.id = "intro-1";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: 8 };
    const preChorus = structuredClone(seed);
    preChorus.id = "pre-chorus-1";
    preChorus.label = "pre-chorus";
    preChorus.timeRange = { start: 20, end: 28 };
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
    song.sections = [intro, pickup, stop, preChorus, chorus, handoff, bridge, outro, tag];

    expect(resolveFirstVerse(song)).toBeNull();
  });

  it("picks the earliest labeled verse and the part that carries the story line", () => {
    const song = withVerseSection({ start: 10, end: 30 });
    const first = resolveFirstVerse(song);

    expect(first?.section.id).toBe("verse-1");
    expect(first?.holdingRole?.id).toBe("lead-vocal");
    expect(first?.atSeconds).toBe(10);
    expect(formatVerseTime(first?.atSeconds ?? -1)).toBe("0:10");
  });

  it("prefers the earlier of two labeled verses", () => {
    const song = withVerseSection({ id: "verse-late", start: 48, end: 64 });
    const seed = song.sections[0]!;
    const earlier = structuredClone(seed);
    earlier.id = "verse-early";
    earlier.timeRange = { start: 10, end: 30 };
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

    const first = resolveFirstVerse(song);
    expect(first?.section.id).toBe("verse-early");
    expect(first?.holdingRole?.id).toBe("bass-guitar");
    expect(first?.atSeconds).toBe(10);
  });

  it("keeps a band-wide story line when no active ranked role holds it", () => {
    const song = withVerseSection({ isActive: false });
    const first = resolveFirstVerse(song);
    expect(first?.section.id).toBe("verse-1");
    expect(first?.holdingRole).toBeNull();
    expect(first?.atSeconds).toBe(10);
  });

  it("skips a verse whose rehearsal window is unbounded", () => {
    const song = withVerseSection({ start: Number.NaN, end: 30 });
    expect(resolveFirstVerse(song)).toBeNull();
  });

  it("skips a verse whose end precedes its start", () => {
    const song = withVerseSection({ start: 30, end: 10 });
    expect(resolveFirstVerse(song)).toBeNull();
  });

  it("skips a zero-length verse window", () => {
    const song = withVerseSection({ start: 10, end: 10 });
    expect(resolveFirstVerse(song)).toBeNull();
  });

  it("skips a verse whose endpoint overflows the shared timing bound", () => {
    const song = withVerseSection({ start: MAX_SECTION_TIME_SECONDS, end: MAX_SECTION_TIME_SECONDS + 1 });
    expect(resolveFirstVerse(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstVerse(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withVerseSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstVerse(song)).toBeNull();
  });

  it("keeps the story line band-wide when role identities are duplicated", () => {
    const song = withVerseSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const first = resolveFirstVerse(song);
    expect(first?.section.id).toBe("verse-1");
    expect(first?.holdingRole).toBeNull();
  });
});
