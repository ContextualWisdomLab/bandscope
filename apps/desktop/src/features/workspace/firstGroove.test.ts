import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatGrooveTime, resolveFirstGroove } from "./firstGroove";

function withGrooveSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    groove?: string;
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
  section.id = overrides.id ?? "verse-groove";
  section.label = overrides.label ?? "verse";
  section.groove = overrides.groove ?? "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "bass-guitar";
  section.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Bass Guitar",
      rehearsalPriority: overrides.priority ?? "high"
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

describe("resolveFirstGroove", () => {
  it("picks the demo song's earliest named groove and the part that holds it", () => {
    const resolved = resolveFirstGroove(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("Straight eighths with a late snare feel");
    expect(formatGrooveTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatGrooveTime(Number.NaN)).toBe("0:00");
    expect(formatGrooveTime(-4)).toBe("0:00");
  });

  it("does not invent a groove from label, cue, setup, simplification, or overlap copy", () => {
    const song = withGrooveSection({ groove: "   " });
    song.sections[0]!.roles[0]!.setupNote = "Keep the attack short so the verse breathes.";
    song.sections[0]!.roles[0]!.simplification = "Stay on roots if the chorus entrance gets muddy.";
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup." };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Density warning: competing with keys."];
    expect(resolveFirstGroove(song)).toBeNull();
  });

  it("does not treat an empty or whitespace groove as a named feel", () => {
    expect(resolveFirstGroove(withGrooveSection({ groove: "" }))).toBeNull();
    expect(resolveFirstGroove(withGrooveSection({ groove: " \n\t " }))).toBeNull();
  });

  it("prefers the earlier of two named grooves", () => {
    const song = withGrooveSection({ id: "verse-late", start: 40, end: 56, roleId: "keys-right" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.groove = "Shuffle on the hats";
    earlier.timeRange = { start: 8, end: 24 };
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium"
      }
    ];
    earlier.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstGroove(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.hint).toBe("Shuffle on the hats");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time groove ties with locale-independent id ordering", () => {
    const song = withGrooveSection({ id: "ä-groove", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-groove";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstGroove(song)?.section.id).toBe("z-groove");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withGrooveSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = { ...section.roles[0]!, id: "z-role", name: "ASCII role" };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstGroove(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a band-wide groove when no active ranked role holds it", () => {
    const song = withGrooveSection({ isActive: false });
    const resolved = resolveFirstGroove(song);
    expect(resolved?.section.id).toBe("verse-groove");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Straight eighths with a late snare feel");
  });

  it("skips a groove whose rehearsal window is unbounded", () => {
    expect(resolveFirstGroove(withGrooveSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a groove whose end precedes its start", () => {
    expect(resolveFirstGroove(withGrooveSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length groove window", () => {
    expect(resolveFirstGroove(withGrooveSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a groove whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstGroove(
        withGrooveSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstGroove(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withGrooveSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstGroove(song)).toBeNull();
  });

  it("keeps the groove band-wide when role identities are duplicated", () => {
    const song = withGrooveSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstGroove(song);
    expect(resolved?.section.id).toBe("verse-groove");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("bounds the groove hint to 180 Unicode code points", () => {
    const song = withGrooveSection({ groove: `${"a".repeat(200)}` });
    const resolved = resolveFirstGroove(song);
    expect(resolved?.hint.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withGrooveSection({ groove: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstGroove(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });
});
