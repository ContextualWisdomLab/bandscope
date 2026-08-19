import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatBridgeTime, resolveFirstBridge } from "./firstBridge";

function withBridgeSection(
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
  const bridge = structuredClone(verse);
  bridge.id = overrides.id ?? "bridge-1";
  bridge.label = "bridge";
  bridge.timeRange = { start: overrides.start ?? 30, end: overrides.end ?? 46 };
  const roleId = overrides.roleId ?? "lead-vocal";
  bridge.roles = [
    {
      ...verse.roles[2]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high"
    }
  ];
  bridge.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, bridge];
  return song;
}

describe("resolveFirstBridge", () => {
  it("returns null when the demo song has no labeled bridge", () => {
    expect(resolveFirstBridge(createDemoRehearsalSong())).toBeNull();
    expect(formatBridgeTime(Number.NaN)).toBe("0:00");
    expect(formatBridgeTime(-4)).toBe("0:00");
  });

  it("does not invent a bridge from an intro, verse, pre-chorus, chorus, outro, tag, pickup, stop, or handoff", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const intro = structuredClone(verse);
    intro.id = "intro-1";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: 8 };
    const preChorus = structuredClone(verse);
    preChorus.id = "pre-chorus-1";
    preChorus.label = "pre-chorus";
    preChorus.timeRange = { start: 20, end: 28 };
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 30, end: 46 };
    const outro = structuredClone(verse);
    outro.id = "outro-1";
    outro.label = "outro";
    outro.timeRange = { start: 90, end: 102 };
    const tag = structuredClone(verse);
    tag.id = "tag-1";
    tag.label = "tag";
    tag.timeRange = { start: 102, end: 108 };
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
    song.sections = [intro, verse, pickup, stop, preChorus, chorus, handoff, outro, tag];

    expect(resolveFirstBridge(song)).toBeNull();
  });

  it("picks the earliest labeled bridge and the part that carries the turn", () => {
    const song = withBridgeSection({ start: 30, end: 46 });
    const first = resolveFirstBridge(song);

    expect(first?.section.id).toBe("bridge-1");
    expect(first?.holdingRole?.id).toBe("lead-vocal");
    expect(first?.atSeconds).toBe(30);
    expect(formatBridgeTime(first?.atSeconds ?? -1)).toBe("0:30");
  });

  it("prefers the earlier of two labeled bridges", () => {
    const song = withBridgeSection({ id: "bridge-late", start: 80, end: 96 });
    const verse = song.sections[0]!;
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "bridge-early";
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

    const first = resolveFirstBridge(song);
    expect(first?.section.id).toBe("bridge-early");
    expect(first?.holdingRole?.id).toBe("bass-guitar");
    expect(first?.atSeconds).toBe(30);
  });

  it("keeps a band-wide turn when no active ranked role holds it", () => {
    const song = withBridgeSection({ isActive: false });
    const first = resolveFirstBridge(song);
    expect(first?.section.id).toBe("bridge-1");
    expect(first?.holdingRole).toBeNull();
    expect(first?.atSeconds).toBe(30);
  });

  it("skips a bridge whose rehearsal window is unbounded", () => {
    const song = withBridgeSection({ start: Number.NaN, end: 46 });
    expect(resolveFirstBridge(song)).toBeNull();
  });

  it("skips a bridge whose end precedes its start", () => {
    const song = withBridgeSection({ start: 46, end: 30 });
    expect(resolveFirstBridge(song)).toBeNull();
  });

  it("skips a zero-length bridge window", () => {
    const song = withBridgeSection({ start: 30, end: 30 });
    expect(resolveFirstBridge(song)).toBeNull();
  });

  it("skips a bridge whose endpoint overflows the shared timing bound", () => {
    const song = withBridgeSection({ start: MAX_SECTION_TIME_SECONDS, end: MAX_SECTION_TIME_SECONDS + 1 });
    expect(resolveFirstBridge(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstBridge(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withBridgeSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstBridge(song)).toBeNull();
  });

  it("keeps the turn band-wide when role identities are duplicated", () => {
    const song = withBridgeSection();
    const role = song.sections[1]!.roles[0]!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const first = resolveFirstBridge(song);
    expect(first?.section.id).toBe("bridge-1");
    expect(first?.holdingRole).toBeNull();
  });
});
