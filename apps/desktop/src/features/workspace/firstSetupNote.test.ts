import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatSetupNoteTime, resolveFirstSetupNote } from "./firstSetupNote";

function withSetupSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    setupNote?: string;
    label?: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    functionLabel?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-setup";
  section.label = overrides.label ?? "verse";
  section.groove = "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "lead-vocal";
  section.roles = [
    {
      ...verse.roles[2]!,
      id: roleId,
      name: overrides.roleName ?? "Lead Vocal",
      rehearsalPriority: overrides.priority ?? "medium",
      cue: { kind: "lyric", value: "city lights" },
      range: { lowestNote: "G#3", highestNote: "C#5" },
      setupNote: overrides.setupNote ?? "Watch the breath before the last line of the verse.",
      simplification: "Keep the sustained note centered; skip the ad-lib on the first pass.",
      overlapWarnings: ["Melodic overlap: competing with Keyboard 1 Right Hand."],
      harmony: {
        chord: "C#m7",
        functionLabel: overrides.functionLabel ?? "vi melodic pull",
        source: "model"
      },
      harmonicExplanation:
        "The melody leans on the ninth over vi, so the vocal line should feel like a lift rather than a strict chord-tone outline.",
      confidence: {
        level: "high",
        source: "user",
        notes: "Singer confirmed the pickup phrasing in rehearsal notes."
      },
      manualOverrides: []
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

describe("resolveFirstSetupNote", () => {
  it("picks the demo song's earliest high-priority setup note and the part that owns it", () => {
    const resolved = resolveFirstSetupNote(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.setupNote).toBe("Keep the attack short so the verse breathes.");
    expect(resolved?.atSeconds).toBe(10);
    expect(formatSetupNoteTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatSetupNoteTime(Number.NaN)).toBe("0:00");
    expect(formatSetupNoteTime(-4)).toBe("0:00");
  });

  it("does not invent a setup note from groove, cue, simplification, overlap, range, chords, function labels, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withSetupSection();
    song.sections[0]!.roles[0]!.setupNote = "";
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.cue = { kind: "lyric", value: "city lights" };
    song.sections[0]!.roles[0]!.range = { lowestNote: "G#3", highestNote: "C#5" };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Melodic overlap: competing with Keyboard 1 Right Hand."];
    song.sections[0]!.roles[0]!.harmony = {
      chord: "C#m7",
      functionLabel: "vi melodic pull",
      source: "user"
    };
    song.sections[0]!.roles[0]!.harmonicExplanation = "The ninth is the reason this lift works.";
    song.sections[0]!.roles[0]!.manualOverrides = [
      {
        field: "harmony",
        value: {
          chord: "C#m11",
          functionLabel: "vi suspended lift",
          source: "user"
        },
        source: "user"
      }
    ];
    song.sections[0]!.roles[0]!.confidence = {
      level: "high",
      source: "user",
      notes: "Watch the breath before the last line of the verse."
    };
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("skips a blank setup note", () => {
    expect(resolveFirstSetupNote(withSetupSection({ setupNote: "   " }))).toBeNull();
  });

  it("prefers the earlier of two setup notes", () => {
    const song = withSetupSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      setupNote: "Late keyboard patch."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        setupNote: "Earlier vocal breath."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstSetupNote(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.setupNote).toBe("Earlier vocal breath.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time setup-note ties with locale-independent id ordering", () => {
    const song = withSetupSection({ id: "ä-setup", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-setup";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstSetupNote(song)?.section.id).toBe("z-setup");
  });

  it("prefers a high-priority setup part over a low-priority part in the same section", () => {
    const song = withSetupSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      setupNote: "Low-priority patch."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      setupNote: "High-priority vocal breath."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstSetupNote(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstSetupNote(song)?.setupNote).toBe("High-priority vocal breath.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withSetupSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      setupNote: "ASCII setup."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstSetupNote(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstSetupNote(song)?.setupNote).toBe("ASCII setup.");
  });

  it("skips a setup note whose graph node is inactive", () => {
    expect(resolveFirstSetupNote(withSetupSection({ isActive: false }))).toBeNull();
  });

  it("skips a setup note whose rehearsal window is unbounded", () => {
    expect(resolveFirstSetupNote(withSetupSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a setup note whose end precedes its start", () => {
    expect(resolveFirstSetupNote(withSetupSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length setup-note window", () => {
    expect(resolveFirstSetupNote(withSetupSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a setup note whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstSetupNote(
        withSetupSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstSetupNote(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withSetupSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("keeps the setup note unnamed when role identities are duplicated", () => {
    const song = withSetupSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstSetupNote(song)).toBeNull();
  });

  it("bounds the setup note to 180 Unicode code points", () => {
    const song = withSetupSection({ setupNote: `${"G".repeat(200)}` });
    const resolved = resolveFirstSetupNote(song);
    expect(resolved?.setupNote.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the setup-note boundary", () => {
    const song = withSetupSection({ setupNote: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstSetupNote(song);
    expect(Array.from(resolved?.setupNote ?? "")).toHaveLength(180);
    expect(resolved?.setupNote.endsWith("😀")).toBe(true);
  });
});
