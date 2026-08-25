import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatTransitionTime, resolveFirstTransition } from "./firstTransition";

function withTransitionRole(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    cueKind?: "lyric" | "count" | "transition";
    cueValue?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  for (const role of verse.roles) {
    role.cue = { kind: "lyric", value: "city lights" };
  }
  const section = structuredClone(verse);
  section.id = overrides.id ?? "change-1";
  section.label = "chorus";
  section.groove = "";
  section.timeRange = { start: overrides.start ?? 46, end: overrides.end ?? 62 };
  const roleId = overrides.roleId ?? "lead-vocal";
  section.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "high",
      cue: {
        kind: overrides.cueKind ?? "transition",
        value: overrides.cueValue ?? "Hold the last chord into the downbeat."
      },
      simplification: "Stay on roots.",
      setupNote: "Keep the patch dry.",
      overlapWarnings: ["Density warning: competing with keys."]
    }
  ];
  section.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, section];
  return song;
}

describe("resolveFirstTransition", () => {
  it("picks the demo song's owned bass transition without inventing one from lyric or count cues", () => {
    const song = createDemoRehearsalSong();
    const transition = resolveFirstTransition(song);

    expect(song.sections[0]!.roles.find((role) => role.id === "lead-vocal")?.cue.kind).toBe("lyric");
    expect(song.sections[0]!.roles.find((role) => role.id === "keys-right")?.cue.kind).toBe("count");
    expect(transition?.holdingRole?.id).toBe("bass-guitar");
    expect(transition?.atSeconds).toBe(10);
    expect(transition?.cue).toBe("Hold through the pickup before the downbeat.");
    expect(formatTransitionTime(transition?.atSeconds ?? -1)).toBe("0:10");
    expect(formatTransitionTime(Number.NaN)).toBe("0:00");
    expect(formatTransitionTime(-4)).toBe("0:00");
  });

  it("does not invent a transition from groove, setup notes, simplification, overlap, or form labels", () => {
    const song = createDemoRehearsalSong();
    for (const role of song.sections[0]!.roles) {
      role.cue = { kind: "lyric", value: "city lights" };
    }
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("does not treat a count or lyric cue as a transition", () => {
    expect(resolveFirstTransition(withTransitionRole({ cueKind: "count" }))).toBeNull();
    expect(resolveFirstTransition(withTransitionRole({ cueKind: "lyric" }))).toBeNull();
  });

  it("prefers the earlier of two labeled transition sections", () => {
    const song = withTransitionRole({ id: "change-late", start: 80, end: 88, roleId: "keys-right", roleName: "Keys" });
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "change-early";
    earlier.timeRange = { start: 46, end: 54 };
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium",
        cue: { kind: "transition", value: "Leave space for the vocal lift." }
      }
    ];
    earlier.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, song.sections[1]!, earlier];

    const transition = resolveFirstTransition(song);
    expect(transition?.section.id).toBe("change-early");
    expect(transition?.holdingRole?.id).toBe("bass-guitar");
    expect(transition?.atSeconds).toBe(46);
  });

  it("breaks same-time section ties with locale-independent id ordering", () => {
    const song = withTransitionRole({ id: "ä-change", start: 46, end: 54 });
    const ascii = structuredClone(song.sections[1]!);
    ascii.id = "z-change";
    song.sections = [song.sections[0]!, song.sections[1]!, ascii];

    expect(resolveFirstTransition(song)?.section.id).toBe("z-change");
  });

  it("uses the owned section-id snapshot when a Proxy get trap substitutes a different tie-break id", () => {
    const song = withTransitionRole({ id: "a-change", start: 46, end: 54 });
    const first = song.sections[1]!;
    const proxiedFirst = new Proxy(first, {
      get(target, property, receiver) {
        if (property === "id") {
          return "z-change";
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const second = structuredClone(first);
    second.id = "m-change";
    song.sections = [song.sections[0]!, proxiedFirst, second];

    expect(resolveFirstTransition(song)?.section).toBe(proxiedFirst);
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withTransitionRole({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[1]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      cue: { kind: "transition" as const, value: "Catch the hit together." }
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTransition(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a band-wide change when no active ranked role holds it", () => {
    const song = withTransitionRole({ isActive: false });
    const transition = resolveFirstTransition(song);
    expect(transition?.section.id).toBe("change-1");
    expect(transition?.holdingRole).toBeNull();
    expect(transition?.cue).toBe("Hold the last chord into the downbeat.");
  });

  it("skips whitespace-only and overlong transition values", () => {
    expect(resolveFirstTransition(withTransitionRole({ cueValue: "   " }))).toBeNull();
    expect(resolveFirstTransition(withTransitionRole({ cueValue: "x".repeat(181) }))).toBeNull();
  });

  it("skips a section whose rehearsal window is unbounded", () => {
    expect(resolveFirstTransition(withTransitionRole({ start: Number.NaN, end: 62 }))).toBeNull();
  });

  it("skips a section whose end precedes its start", () => {
    expect(resolveFirstTransition(withTransitionRole({ start: 62, end: 46 }))).toBeNull();
  });

  it("skips a zero-length window", () => {
    expect(resolveFirstTransition(withTransitionRole({ start: 46, end: 46 }))).toBeNull();
  });

  it("skips a section whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstTransition(
        withTransitionRole({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstTransition(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withTransitionRole();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("keeps the change band-wide when role identities are duplicated", () => {
    const song = withTransitionRole();
    const role = song.sections[1]!.roles[0]!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const transition = resolveFirstTransition(song);
    expect(transition?.section.id).toBe("change-1");
    expect(transition?.holdingRole).toBeNull();
  });
});
