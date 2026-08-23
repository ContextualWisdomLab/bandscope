import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatTransitionTime, resolveFirstTransition } from "./firstTransition";

function withTransitionSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    hint?: string;
    label?: "intro" | "verse" | "chorus" | "bridge" | "outro" | "tag";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-transition";
  section.label = overrides.label ?? "verse";
  section.groove = "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "bass-guitar";
  section.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Bass Guitar",
      rehearsalPriority: overrides.priority ?? "high",
      cue: {
        kind: "transition",
        value: overrides.hint ?? "Hold through the pickup before the downbeat."
      },
      overlapWarnings: [],
      setupNote: "Keep the attack short so the verse breathes.",
      simplification: "Stay on roots if the chorus entrance gets muddy."
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
  song.sections = [section];
  return song;
}

describe("resolveFirstTransition", () => {
  it("picks the demo song's earliest named transition and the part that carries it", () => {
    const resolved = resolveFirstTransition(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("Hold through the pickup before the downbeat.");
    expect(formatTransitionTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatTransitionTime(Number.NaN)).toBe("0:00");
    expect(formatTransitionTime(-4)).toBe("0:00");
  });

  it("does not invent a change from lyric, count, groove, setup, simplification, overlap, or range copy", () => {
    const song = withTransitionSection({ hint: "   " });
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.setupNote = "Keep the attack short so the verse breathes.";
    song.sections[0]!.roles[0]!.simplification = "Stay on roots if the chorus entrance gets muddy.";
    song.sections[0]!.roles[0]!.cue = { kind: "lyric", value: "Hold through the pickup." };
    song.sections[0]!.roles[0]!.overlapWarnings = [
      "Density warning: competing with Keyboard Left Hand in low register."
    ];
    song.sections[0]!.roles[0]!.range = { lowestNote: "C#2", highestNote: "E3" };
    expect(resolveFirstTransition(song)).toBeNull();

    song.sections[0]!.roles[0]!.cue = { kind: "count", value: "Enter on beat 2 after the pickup." };
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("does not treat an empty or whitespace transition cue as a named change", () => {
    expect(resolveFirstTransition(withTransitionSection({ hint: "" }))).toBeNull();
    expect(resolveFirstTransition(withTransitionSection({ hint: " \n\t " }))).toBeNull();
  });

  it("prefers the earlier of two named transitions", () => {
    const song = withTransitionSection({ id: "verse-late", start: 40, end: 56, roleId: "keys-right" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium",
        cue: { kind: "transition", value: "Hold the floor through the pickup." }
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstTransition(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.hint).toBe("Hold the floor through the pickup.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time transition ties with locale-independent id ordering", () => {
    const song = withTransitionSection({ id: "ä-transition", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-transition";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstTransition(song)?.section.id).toBe("z-transition");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withTransitionSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      cue: { kind: "transition" as const, value: "ASCII hold" }
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTransition(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a band-wide transition when no active ranked role carries it", () => {
    const song = withTransitionSection({ isActive: false });
    const resolved = resolveFirstTransition(song);
    expect(resolved?.section.id).toBe("verse-transition");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Hold through the pickup before the downbeat.");
  });

  it("skips a transition whose rehearsal window is unbounded", () => {
    expect(resolveFirstTransition(withTransitionSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a transition whose end precedes its start", () => {
    expect(resolveFirstTransition(withTransitionSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length transition window", () => {
    expect(resolveFirstTransition(withTransitionSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a transition whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstTransition(
        withTransitionSection({
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
    const song = withTransitionSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstTransition(song)).toBeNull();
  });

  it("keeps the transition band-wide when role identities are duplicated", () => {
    const song = withTransitionSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstTransition(song);
    expect(resolved?.section.id).toBe("verse-transition");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("bounds the transition hint to 180 Unicode code points", () => {
    const song = withTransitionSection({ hint: `${"a".repeat(200)}` });
    const resolved = resolveFirstTransition(song);
    expect(resolved?.hint.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withTransitionSection({ hint: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstTransition(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });

  it("skips non-object roles while keeping a later owned transition", () => {
    const song = withTransitionSection();
    const validRole = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [42 as never, validRole];
    const resolved = resolveFirstTransition(song);
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.hint).toBe("Hold through the pickup before the downbeat.");
  });

  it("keeps a deterministic winner when two named transitions share time and id", () => {
    const song = withTransitionSection({ id: "shared-id", start: 10, end: 26 });
    const twin = structuredClone(song.sections[0]!);
    song.sections = [song.sections[0]!, twin];
    const resolved = resolveFirstTransition(song);
    expect(resolved?.section.id).toBe("shared-id");
    expect(resolved?.atSeconds).toBe(10);
  });

  it("contains throws from untrusted runtime property access", () => {
    const song = withTransitionSection();
    const hostile = new Proxy(song, {
      get(target, prop, receiver) {
        if (prop === "sections") {
          throw new Error("hostile sections");
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    expect(resolveFirstTransition(hostile as typeof song)).toBeNull();
  });
});
