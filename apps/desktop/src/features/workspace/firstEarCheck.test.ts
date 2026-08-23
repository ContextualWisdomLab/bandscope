import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatEarCheckTime, resolveFirstEarCheck } from "./firstEarCheck";

function withEarCheckSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    notes?: string;
    level?: "low" | "medium" | "high";
    sectionLevel?: "low" | "medium" | "high";
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
  section.id = overrides.id ?? "verse-ear-check";
  section.label = overrides.label ?? "verse";
  section.groove = "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  section.confidence = {
    level: overrides.sectionLevel ?? "high",
    source: "model",
    notes: "Section-level notes should not invent a clash."
  };
  const roleId = overrides.roleId ?? "bass-guitar";
  section.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Bass Guitar",
      rehearsalPriority: overrides.priority ?? "high",
      overlapWarnings: [],
      setupNote: "Keep the attack short so the verse breathes.",
      simplification: "Stay on roots if the chorus entrance gets muddy.",
      cue: { kind: "transition", value: "Hold through the pickup." },
      range: { lowestNote: "C#2", highestNote: "E3" },
      confidence: {
        level: overrides.level ?? "medium",
        source: "model",
        notes: overrides.notes ?? "Watch the slide into the turnaround."
      }
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

describe("resolveFirstEarCheck", () => {
  it("picks the demo song's earliest named ear check and the part that carries it", () => {
    const resolved = resolveFirstEarCheck(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("Watch the slide into the turnaround.");
    expect(formatEarCheckTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatEarCheckTime(Number.NaN)).toBe("0:00");
    expect(formatEarCheckTime(-4)).toBe("0:00");
  });

  it("does not invent an ear check from groove, cue, setup, simplification, overlap, or range copy", () => {
    const song = withEarCheckSection({ level: "high", sectionLevel: "high", notes: "   " });
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.setupNote = "Keep the attack short so the verse breathes.";
    song.sections[0]!.roles[0]!.simplification = "Stay on roots if the chorus entrance gets muddy.";
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup." };
    song.sections[0]!.roles[0]!.range = { lowestNote: "C#2", highestNote: "E3" };
    song.sections[0]!.roles[0]!.overlapWarnings = [
      "Density warning: competing with Keyboard Left Hand in low register."
    ];
    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("still names an ear check when owned notes are empty", () => {
    const resolved = resolveFirstEarCheck(withEarCheckSection({ notes: "   " }));
    expect(resolved?.section.id).toBe("verse-ear-check");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.hint).toBe("");
  });

  it("prefers the earlier of two named ear checks", () => {
    const song = withEarCheckSection({ id: "verse-late", start: 40, end: 56, roleId: "keys-right" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium",
        confidence: {
          level: "low",
          source: "model",
          notes: "Bass entrance is still a guess."
        }
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstEarCheck(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.hint).toBe("Bass entrance is still a guess.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time ear-check ties with locale-independent id ordering", () => {
    const song = withEarCheckSection({ id: "ä-ear-check", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-ear-check";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstEarCheck(song)?.section.id).toBe("z-ear-check");
  });

  it("prefers a low-confidence role over a medium-confidence role in the same section", () => {
    const song = withEarCheckSection({ roleId: "keys-right", roleName: "Keys", level: "medium" });
    const section = song.sections[0]!;
    const lowRole = {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "low",
      confidence: {
        level: "low" as const,
        source: "model" as const,
        notes: "Bass still needs an ear check."
      }
    };
    section.roles = [section.roles[0]!, lowRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstEarCheck(song)?.holdingRole?.id).toBe("bass-guitar");
    expect(resolveFirstEarCheck(song)?.hint).toBe("Bass still needs an ear check.");
  });

  it("breaks equal-uncertainty role ties with locale-independent id ordering", () => {
    const song = withEarCheckSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      confidence: {
        level: "medium" as const,
        source: "model" as const,
        notes: "ASCII ear check"
      }
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstEarCheck(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a section-wide ear check when no active ranked role carries it", () => {
    const song = withEarCheckSection({ isActive: false, sectionLevel: "medium" });
    const resolved = resolveFirstEarCheck(song);
    expect(resolved?.section.id).toBe("verse-ear-check");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Watch the slide into the turnaround.");
  });

  it("skips an ear check whose rehearsal window is unbounded", () => {
    expect(resolveFirstEarCheck(withEarCheckSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips an ear check whose end precedes its start", () => {
    expect(resolveFirstEarCheck(withEarCheckSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length ear-check window", () => {
    expect(resolveFirstEarCheck(withEarCheckSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips an ear check whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstEarCheck(
        withEarCheckSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstEarCheck(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withEarCheckSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstEarCheck(song)).toBeNull();
  });

  it("keeps the ear check section-wide when role identities are duplicated", () => {
    const song = withEarCheckSection({ sectionLevel: "medium" });
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstEarCheck(song);
    expect(resolved?.section.id).toBe("verse-ear-check");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("bounds the ear-check hint to 180 Unicode code points", () => {
    const song = withEarCheckSection({ notes: `${"a".repeat(200)}` });
    const resolved = resolveFirstEarCheck(song);
    expect(resolved?.hint.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withEarCheckSection({ notes: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstEarCheck(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });
});
