import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatSimplificationTime, resolveFirstSimplification } from "./firstSimplification";

function withSimplification(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    simplification?: string;
    setupNote?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-simple";
  section.label = "verse";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "bass-guitar";
  section.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Bass Guitar",
      rehearsalPriority: overrides.priority ?? "high",
      simplification: overrides.simplification ?? "Stay on roots if the chorus entrance gets muddy.",
      setupNote: overrides.setupNote ?? "Keep the attack short so the verse breathes."
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

describe("resolveFirstSimplification", () => {
  it("picks the demo song's earliest high-priority simpler take", () => {
    const resolved = resolveFirstSimplification(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("Stay on roots if the chorus entrance gets muddy.");
    expect(formatSimplificationTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatSimplificationTime(Number.NaN)).toBe("0:00");
    expect(formatSimplificationTime(-4)).toBe("0:00");
  });

  it("does not invent a simpler take from setup notes, cues, or overlap warnings", () => {
    const song = withSimplification({ simplification: "   " });
    song.sections[0]!.roles[0]!.setupNote = "Keep the attack short so the verse breathes.";
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup." };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Density warning: competing with keys."];
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("prefers the earlier of two named simpler takes", () => {
    const song = withSimplification({ id: "verse-late", start: 40, end: 56, roleId: "keys-right" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.timeRange = { start: 10, end: 26 };
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "medium",
        simplification: "Stay on roots."
      }
    ];
    earlier.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstSimplification(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
    expect(resolved?.atSeconds).toBe(10);
  });

  it("breaks same-time section ties with locale-independent id ordering", () => {
    const song = withSimplification({ id: "ä-verse", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-verse";
    song.sections = [song.sections[0]!, ascii];
    expect(resolveFirstSimplification(song)?.section.id).toBe("z-verse");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withSimplification({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      simplification: "Drop the top extension."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstSimplification(song)?.holdingRole?.id).toBe("z-role");
  });

  it("skips inactive parts even when they name a simpler take", () => {
    expect(resolveFirstSimplification(withSimplification({ isActive: false }))).toBeNull();
  });

  it("skips a simpler take whose rehearsal window is unbounded", () => {
    expect(resolveFirstSimplification(withSimplification({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a simpler take whose end precedes its start", () => {
    expect(resolveFirstSimplification(withSimplification({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length simpler take window", () => {
    expect(resolveFirstSimplification(withSimplification({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a simpler take whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstSimplification(
        withSimplification({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstSimplification(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withSimplification();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("returns null when role identities are duplicated", () => {
    const song = withSimplification();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstSimplification(song)).toBeNull();
  });

  it("bounds an oversized hint instead of dropping the next action", () => {
    const song = withSimplification({ simplification: `${"Stay on roots. ".repeat(40)}end` });
    const resolved = resolveFirstSimplification(song);
    expect(resolved?.hint.length).toBe(180);
    expect(resolved?.holdingRole?.id).toBe("bass-guitar");
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withSimplification({ simplification: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstSimplification(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });
});
