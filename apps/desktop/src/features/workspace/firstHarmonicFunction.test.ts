import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatHarmonicFunctionTime, resolveFirstHarmonicFunction } from "./firstHarmonicFunction";

function withFunctionSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    functionLabel?: string;
    label?: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    chord?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-function";
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
      setupNote: "Watch the breath before the last line of the verse.",
      simplification: "Keep the sustained note centered; skip the ad-lib on the first pass.",
      overlapWarnings: ["Melodic overlap: competing with Keyboard 1 Right Hand."],
      harmony: {
        chord: overrides.chord ?? "C#m7",
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

describe("resolveFirstHarmonicFunction", () => {
  it("picks the demo song's earliest high-priority harmonic function and the part that owns it", () => {
    const resolved = resolveFirstHarmonicFunction(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.functionLabel).toBe("vi pedal anchor");
    expect(resolved?.atSeconds).toBe(10);
    expect(formatHarmonicFunctionTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatHarmonicFunctionTime(Number.NaN)).toBe("0:00");
    expect(formatHarmonicFunctionTime(-4)).toBe("0:00");
  });

  it("does not invent a harmonic function from groove, cue, simplification, overlap, range, chords, explanations, setup notes, confirmed overrides, or confidence notes", () => {
    const song = withFunctionSection();
    song.sections[0]!.roles[0]!.harmony = {
      ...song.sections[0]!.roles[0]!.harmony,
      functionLabel: ""
    };
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.cue = { kind: "lyric", value: "city lights" };
    song.sections[0]!.roles[0]!.range = { lowestNote: "G#3", highestNote: "C#5" };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Melodic overlap: competing with Keyboard 1 Right Hand."];
    song.sections[0]!.roles[0]!.setupNote = "Watch the breath before the last line of the verse.";
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
      notes: "vi pedal anchor"
    };
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("skips a blank harmonic function", () => {
    expect(resolveFirstHarmonicFunction(withFunctionSection({ functionLabel: "   " }))).toBeNull();
  });

  it("prefers the earlier of two harmonic functions", () => {
    const song = withFunctionSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      functionLabel: "Late Imaj7 color."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        harmony: {
          ...earlier.roles[0]!.harmony,
          functionLabel: "Earlier vi pull."
        }
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstHarmonicFunction(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.functionLabel).toBe("Earlier vi pull.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time harmonic-function ties with locale-independent id ordering", () => {
    const song = withFunctionSection({ id: "ä-function", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-function";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstHarmonicFunction(song)?.section.id).toBe("z-function");
  });

  it("prefers a high-priority function part over a low-priority part in the same section", () => {
    const song = withFunctionSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      functionLabel: "Low-priority color."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      harmony: {
        ...section.roles[0]!.harmony,
        functionLabel: "High-priority vi pull."
      }
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHarmonicFunction(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstHarmonicFunction(song)?.functionLabel).toBe("High-priority vi pull.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withFunctionSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      harmony: {
        ...section.roles[0]!.harmony,
        functionLabel: "ASCII function."
      }
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHarmonicFunction(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstHarmonicFunction(song)?.functionLabel).toBe("ASCII function.");
  });

  it("skips a harmonic function whose graph node is inactive", () => {
    expect(resolveFirstHarmonicFunction(withFunctionSection({ isActive: false }))).toBeNull();
  });

  it("skips a harmonic function whose rehearsal window is unbounded", () => {
    expect(resolveFirstHarmonicFunction(withFunctionSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a harmonic function whose end precedes its start", () => {
    expect(resolveFirstHarmonicFunction(withFunctionSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length harmonic-function window", () => {
    expect(resolveFirstHarmonicFunction(withFunctionSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a harmonic function whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstHarmonicFunction(
        withFunctionSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstHarmonicFunction(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withFunctionSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("keeps the harmonic function unnamed when role identities are duplicated", () => {
    const song = withFunctionSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstHarmonicFunction(song)).toBeNull();
  });

  it("bounds the harmonic function to 180 Unicode code points", () => {
    const song = withFunctionSection({ functionLabel: `${"G".repeat(200)}` });
    const resolved = resolveFirstHarmonicFunction(song);
    expect(resolved?.functionLabel.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the harmonic-function boundary", () => {
    const song = withFunctionSection({ functionLabel: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstHarmonicFunction(song);
    expect(Array.from(resolved?.functionLabel ?? "")).toHaveLength(180);
    expect(resolved?.functionLabel.endsWith("😀")).toBe(true);
  });
});
