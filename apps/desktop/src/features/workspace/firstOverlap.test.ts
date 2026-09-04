import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatOverlapTime, resolveFirstOverlap } from "./firstOverlap";

function withOverlapSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    warning?: string;
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
  section.id = overrides.id ?? "verse-overlap";
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
      overlapWarnings: [overrides.warning ?? "Density warning: competing with Keyboard Left Hand in low register."]
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

describe("resolveFirstOverlap", () => {
  it("picks the demo song's earliest named overlap and the part that carries it", () => {
    const resolved = resolveFirstOverlap(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("Density warning: competing with Keyboard Left Hand in low register.");
    expect(formatOverlapTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatOverlapTime(Number.NaN)).toBe("0:00");
    expect(formatOverlapTime(-4)).toBe("0:00");
  });

  it("does not invent a clash from groove, cue, setup, simplification, or range copy", () => {
    const song = withOverlapSection({ warning: "   " });
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.setupNote = "Keep the attack short so the verse breathes.";
    song.sections[0]!.roles[0]!.simplification = "Stay on roots if the chorus entrance gets muddy.";
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup." };
    song.sections[0]!.roles[0]!.range = { lowestNote: "C#2", highestNote: "E3" };
    expect(resolveFirstOverlap(song)).toBeNull();
  });

  it("does not treat an empty or whitespace overlap warning as a named clash", () => {
    expect(resolveFirstOverlap(withOverlapSection({ warning: "" }))).toBeNull();
    expect(resolveFirstOverlap(withOverlapSection({ warning: " \n\t " }))).toBeNull();
  });

  it("prefers the earlier of two named overlaps", () => {
    const song = withOverlapSection({ id: "verse-late", start: 40, end: 56, roleId: "keys-right" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium",
        overlapWarnings: ["Bass and keys share the floor."]
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstOverlap(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.hint).toBe("Bass and keys share the floor.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time overlap ties with locale-independent id ordering", () => {
    const song = withOverlapSection({ id: "ä-overlap", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-overlap";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstOverlap(song)?.section.id).toBe("z-overlap");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withOverlapSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      overlapWarnings: ["ASCII clash"]
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstOverlap(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a band-wide overlap when no active ranked role carries it", () => {
    const song = withOverlapSection({ isActive: false });
    const resolved = resolveFirstOverlap(song);
    expect(resolved?.section.id).toBe("verse-overlap");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Density warning: competing with Keyboard Left Hand in low register.");
  });

  it("skips an overlap whose rehearsal window is unbounded", () => {
    expect(resolveFirstOverlap(withOverlapSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips an overlap whose end precedes its start", () => {
    expect(resolveFirstOverlap(withOverlapSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length overlap window", () => {
    expect(resolveFirstOverlap(withOverlapSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips an overlap whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstOverlap(
        withOverlapSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstOverlap(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withOverlapSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstOverlap(song)).toBeNull();
  });

  it("keeps the overlap band-wide when role identities are duplicated", () => {
    const song = withOverlapSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstOverlap(song);
    expect(resolved?.section.id).toBe("verse-overlap");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("bounds the overlap hint to 180 Unicode code points", () => {
    const song = withOverlapSection({ warning: `${"a".repeat(200)}` });
    const resolved = resolveFirstOverlap(song);
    expect(resolved?.hint.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withOverlapSection({ warning: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstOverlap(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });
});
