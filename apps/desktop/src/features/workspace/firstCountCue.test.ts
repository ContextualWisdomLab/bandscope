import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatCountCueTime, resolveFirstCountCue } from "./firstCountCue";

function withCountSection(
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
  section.id = overrides.id ?? "verse-count";
  section.label = overrides.label ?? "verse";
  section.groove = "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "keys-right";
  section.roles = [
    {
      ...verse.roles[1]!,
      id: roleId,
      name: overrides.roleName ?? "Keyboard 1 Right Hand",
      rehearsalPriority: overrides.priority ?? "high",
      cue: {
        kind: "count",
        value: overrides.hint ?? "Enter on beat 2 after the pickup."
      },
      overlapWarnings: [],
      setupNote: "Keep the patch bright enough to stay over the guitars.",
      simplification: "Drop the top extension if the chorus turnaround still feels busy."
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

describe("resolveFirstCountCue", () => {
  it("picks the demo song's earliest named count and the part that carries it", () => {
    const resolved = resolveFirstCountCue(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole?.id).toBe("keys-right");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("Enter on beat 2 after the pickup.");
    expect(formatCountCueTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatCountCueTime(Number.NaN)).toBe("0:00");
    expect(formatCountCueTime(-4)).toBe("0:00");
  });

  it("does not invent a count from lyric, transition, groove, setup, simplification, overlap, or range copy", () => {
    const song = withCountSection({ hint: "   " });
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.setupNote = "Keep the patch bright enough to stay over the guitars.";
    song.sections[0]!.roles[0]!.simplification = "Drop the top extension if the chorus turnaround still feels busy.";
    song.sections[0]!.roles[0]!.cue = { kind: "lyric", value: "Enter on beat 2 after the pickup." };
    song.sections[0]!.roles[0]!.overlapWarnings = [
      "Melodic overlap: top notes conflict with Lead Vocal range."
    ];
    song.sections[0]!.roles[0]!.range = { lowestNote: "B3", highestNote: "G#5" };
    expect(resolveFirstCountCue(song)).toBeNull();

    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup before the downbeat." };
    expect(resolveFirstCountCue(song)).toBeNull();
  });

  it("does not treat an empty or whitespace count cue as a named entrance", () => {
    expect(resolveFirstCountCue(withCountSection({ hint: "" }))).toBeNull();
    expect(resolveFirstCountCue(withCountSection({ hint: " \n\t " }))).toBeNull();
  });

  it("prefers the earlier of two named counts", () => {
    const song = withCountSection({ id: "verse-late", start: 40, end: 56, roleId: "lead-vocal" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "keys-right",
        name: "Keyboard 1 Right Hand",
        rehearsalPriority: "medium",
        cue: { kind: "count", value: "Come in on the and of four." }
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstCountCue(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole?.id).toBe("keys-right");
    expect(resolved?.hint).toBe("Come in on the and of four.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time count ties with locale-independent id ordering", () => {
    const song = withCountSection({ id: "ä-count", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-count";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstCountCue(song)?.section.id).toBe("z-count");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withCountSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      cue: { kind: "count" as const, value: "ASCII count" }
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstCountCue(song)?.holdingRole?.id).toBe("z-role");
  });

  it("keeps a band-wide count when no active ranked role carries it", () => {
    const song = withCountSection({ isActive: false });
    const resolved = resolveFirstCountCue(song);
    expect(resolved?.section.id).toBe("verse-count");
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Enter on beat 2 after the pickup.");
  });

  it("skips a count whose rehearsal window is unbounded", () => {
    expect(resolveFirstCountCue(withCountSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a count whose end precedes its start", () => {
    expect(resolveFirstCountCue(withCountSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length count window", () => {
    expect(resolveFirstCountCue(withCountSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a count whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstCountCue(
        withCountSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstCountCue(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withCountSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstCountCue(song)).toBeNull();
  });

  it("keeps the count band-wide when role identities are duplicated", () => {
    const song = withCountSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const resolved = resolveFirstCountCue(song);
    expect(resolved?.section.id).toBe("verse-count");
    expect(resolved?.holdingRole).toBeNull();
  });

  it("bounds the count hint to 180 Unicode code points", () => {
    const song = withCountSection({ hint: `${"a".repeat(200)}` });
    const resolved = resolveFirstCountCue(song);
    expect(resolved?.hint.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withCountSection({ hint: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstCountCue(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });

  it("skips non-object roles while keeping a later owned count", () => {
    const song = withCountSection();
    const validRole = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [42 as never, validRole];
    const resolved = resolveFirstCountCue(song);
    expect(resolved?.holdingRole?.id).toBe("keys-right");
    expect(resolved?.hint).toBe("Enter on beat 2 after the pickup.");
  });

  it("keeps a deterministic winner when two named counts share time and id", () => {
    const song = withCountSection({ id: "shared-id", start: 10, end: 26 });
    const twin = structuredClone(song.sections[0]!);
    song.sections = [song.sections[0]!, twin];
    const resolved = resolveFirstCountCue(song);
    expect(resolved?.section.id).toBe("shared-id");
    expect(resolved?.atSeconds).toBe(10);
  });

  it("contains throws from untrusted runtime property access", () => {
    const song = withCountSection();
    const hostile = new Proxy(song, {
      get(target, prop, receiver) {
        if (prop === "sections") {
          throw new Error("hostile sections");
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    expect(resolveFirstCountCue(hostile as typeof song)).toBeNull();
  });
});
