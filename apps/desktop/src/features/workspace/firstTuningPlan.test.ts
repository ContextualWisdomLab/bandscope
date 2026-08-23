import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatTuningPlanTime, resolveFirstTuningPlan } from "./firstTuningPlan";

const DEMO_TUNING_PLAN =
  "Tune the E string down to D so the verse riff sits on the open fifth.";

function withTuningSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    tuningPlan?: string;
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
  section.id = overrides.id ?? "verse-tuning";
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
        "The melody leans on the ninth over vi, so the vocal line should feel like a lift rather than a strict chord-tone outline.",
      confidence: {
        level: "high",
        source: "user",
        notes: "Singer confirmed the pickup phrasing in rehearsal notes."
      },
      tuningPlan:
        overrides.tuningPlan ??
        "Tune the E string down to D so the verse riff sits on the open fifth.",
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

describe("resolveFirstTuningPlan", () => {
  it("picks the demo song's earliest high-priority tuning plan and the part that owns it", () => {
    const resolved = resolveFirstTuningPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.tuningPlan).toBe(DEMO_TUNING_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatTuningPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatTuningPlanTime(Number.NaN)).toBe("0:00");
    expect(formatTuningPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a tuning plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withTuningSection();
    delete song.sections[0]!.roles[0]!.tuningPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = "Setup: Drop D, tune the sixth string down";
    song.sections[0]!.roles[0]!.transpositionPlan = "If the singer drops to B minor, keep the shape a whole step lower.";
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
      notes: "Tune the E string down to D so the verse riff sits on the open fifth."
    };
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("skips a blank tuning plan", () => {
    expect(resolveFirstTuningPlan(withTuningSection({ tuningPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line tuning plan", () => {
    expect(
      resolveFirstTuningPlan(withTuningSection({ tuningPlan: "Drop a step.\nKeep the pickup." }))
    ).toBeNull();
  });

  it("prefers the earlier of two tuning plans", () => {
    const song = withTuningSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      tuningPlan: "Late bass tuning."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        tuningPlan: "Earlier bass tuning."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstTuningPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.tuningPlan).toBe("Earlier bass tuning.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time tuning-plan ties with locale-independent id ordering", () => {
    const song = withTuningSection({ id: "ä-tuning", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-tuning";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstTuningPlan(song)?.section.id).toBe("z-tuning");
  });

  it("prefers a high-priority tuning part over a low-priority part in the same section", () => {
    const song = withTuningSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      tuningPlan: "Low-priority bass tuning."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      tuningPlan: "High-priority bass tuning."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTuningPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstTuningPlan(song)?.tuningPlan).toBe("High-priority bass tuning.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withTuningSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      tuningPlan: "ASCII bass tuning."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTuningPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstTuningPlan(song)?.tuningPlan).toBe("ASCII bass tuning.");
  });

  it("skips a tuning plan whose graph node is inactive", () => {
    expect(resolveFirstTuningPlan(withTuningSection({ isActive: false }))).toBeNull();
  });

  it("skips a tuning plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstTuningPlan(withTuningSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a tuning plan whose end precedes its start", () => {
    expect(resolveFirstTuningPlan(withTuningSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length tuning-plan window", () => {
    expect(resolveFirstTuningPlan(withTuningSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a tuning plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstTuningPlan(
        withTuningSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstTuningPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withTuningSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("keeps the tuning plan unnamed when role identities are duplicated", () => {
    const song = withTuningSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstTuningPlan(song)).toBeNull();
  });

  it("bounds the tuning plan to 180 Unicode code points", () => {
    const song = withTuningSection({ tuningPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstTuningPlan(song);
    expect(resolved?.tuningPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the tuning-plan boundary", () => {
    const song = withTuningSection({ tuningPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstTuningPlan(song);
    expect(Array.from(resolved?.tuningPlan ?? "")).toHaveLength(180);
    expect(resolved?.tuningPlan.endsWith("😀")).toBe(true);
  });
});
