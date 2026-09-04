import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatHarmonicExplanationTime, resolveFirstHarmonicExplanation } from "./firstHarmonicExplanation";

function withExplainedSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    explanation?: string;
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
  section.id = overrides.id ?? "verse-explained";
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
        chord: "C#m7",
        functionLabel: overrides.functionLabel ?? "vi melodic pull",
        source: "model"
      },
      harmonicExplanation:
        overrides.explanation ??
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

describe("resolveFirstHarmonicExplanation", () => {
  it("picks the demo song's earliest high-priority explanation and the part that owns it", () => {
    const resolved = resolveFirstHarmonicExplanation(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.explanation).toBe(
      "The bass holds the vi center so the rest of the section can lean into the pickup without losing the tonal floor."
    );
    expect(resolved?.atSeconds).toBe(10);
    expect(formatHarmonicExplanationTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatHarmonicExplanationTime(Number.NaN)).toBe("0:00");
    expect(formatHarmonicExplanationTime(-4)).toBe("0:00");
  });

  it("does not invent an explanation from function labels, groove, cue, setup, simplification, overlap, range, confidence, or confirmed chords", () => {
    const song = withExplainedSection();
    delete song.sections[0]!.roles[0]!.harmonicExplanation;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.setupNote = "Watch the breath before the last line of the verse.";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.cue = { kind: "lyric", value: "city lights" };
    song.sections[0]!.roles[0]!.range = { lowestNote: "G#3", highestNote: "C#5" };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Melodic overlap: competing with Keyboard 1 Right Hand."];
    song.sections[0]!.roles[0]!.harmony = {
      chord: "C#m7",
      functionLabel: "vi melodic pull",
      source: "user"
    };
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
      notes: "The ninth is the reason this lift works."
    };
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("skips a blank harmonic explanation", () => {
    expect(resolveFirstHarmonicExplanation(withExplainedSection({ explanation: "   " }))).toBeNull();
  });

  it("prefers the earlier of two harmonic explanations", () => {
    const song = withExplainedSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      explanation: "Late keyboard color."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        harmonicExplanation: "Earlier vocal lift."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstHarmonicExplanation(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.explanation).toBe("Earlier vocal lift.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time explanation ties with locale-independent id ordering", () => {
    const song = withExplainedSection({ id: "ä-explained", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-explained";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstHarmonicExplanation(song)?.section.id).toBe("z-explained");
  });

  it("prefers a high-priority explained part over a low-priority part in the same section", () => {
    const song = withExplainedSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      explanation: "Low-priority color."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      harmonicExplanation: "High-priority vocal lift."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHarmonicExplanation(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstHarmonicExplanation(song)?.explanation).toBe("High-priority vocal lift.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withExplainedSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      harmonicExplanation: "ASCII explanation."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHarmonicExplanation(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstHarmonicExplanation(song)?.explanation).toBe("ASCII explanation.");
  });

  it("skips an explanation whose graph node is inactive", () => {
    expect(resolveFirstHarmonicExplanation(withExplainedSection({ isActive: false }))).toBeNull();
  });

  it("skips an explanation whose rehearsal window is unbounded", () => {
    expect(resolveFirstHarmonicExplanation(withExplainedSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips an explanation whose end precedes its start", () => {
    expect(resolveFirstHarmonicExplanation(withExplainedSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length explanation window", () => {
    expect(resolveFirstHarmonicExplanation(withExplainedSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips an explanation whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstHarmonicExplanation(
        withExplainedSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstHarmonicExplanation(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withExplainedSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("keeps the explanation unnamed when role identities are duplicated", () => {
    const song = withExplainedSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstHarmonicExplanation(song)).toBeNull();
  });

  it("bounds the explanation to 180 Unicode code points", () => {
    const song = withExplainedSection({ explanation: `${"G".repeat(200)}` });
    const resolved = resolveFirstHarmonicExplanation(song);
    expect(resolved?.explanation.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the explanation boundary", () => {
    const song = withExplainedSection({ explanation: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstHarmonicExplanation(song);
    expect(Array.from(resolved?.explanation ?? "")).toHaveLength(180);
    expect(resolved?.explanation.endsWith("😀")).toBe(true);
  });
});
