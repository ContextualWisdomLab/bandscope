import { describe, expect, it } from "vitest";
import {
  MAX_SECTION_TIME_SECONDS,
  createDemoRehearsalSong,
  type RehearsalPriority,
  type SectionFormLabel
} from "@bandscope/shared-types";
import { formatTranspositionPlanTime, resolveFirstTranspositionPlan } from "./firstTranspositionPlan";

const DEMO_TRANSPOSITION_PLAN =
  "If the singer drops to B minor, keep the shape a whole step lower and let keys keep the color tones.";

function withTranspositionSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    transpositionPlan?: string;
    label?: SectionFormLabel;
    roleId?: string;
    roleName?: string;
    priority?: RehearsalPriority;
    isActive?: boolean;
    functionLabel?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-transpose";
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
      transpositionPlan:
        overrides.transpositionPlan ??
        "If the room wants more ease, move the section down a whole step and keep the pickup breath mark in the same place.",
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

describe("resolveFirstTranspositionPlan", () => {
  it("picks the demo song's earliest high-priority transposition plan and the part that owns it", () => {
    const resolved = resolveFirstTranspositionPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.transpositionPlan).toBe(DEMO_TRANSPOSITION_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatTranspositionPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatTranspositionPlanTime(Number.NaN)).toBe("0:00");
    expect(formatTranspositionPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a transposition plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withTranspositionSection();
    delete song.sections[0]!.roles[0]!.transpositionPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = "Watch the breath before the last line of the verse.";
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
      notes: "If the singer drops to B minor, keep the shape a whole step lower."
    };
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("skips a blank transposition plan", () => {
    expect(resolveFirstTranspositionPlan(withTranspositionSection({ transpositionPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line transposition plan", () => {
    expect(
      resolveFirstTranspositionPlan(withTranspositionSection({ transpositionPlan: "Drop a step.\nKeep the pickup." }))
    ).toBeNull();
  });

  it("prefers the earlier of two transposition plans", () => {
    const song = withTranspositionSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      transpositionPlan: "Late keyboard voicing."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        transpositionPlan: "Earlier vocal drop."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstTranspositionPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.transpositionPlan).toBe("Earlier vocal drop.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time transposition-plan ties with locale-independent id ordering", () => {
    const song = withTranspositionSection({ id: "ä-transpose", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-transpose";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstTranspositionPlan(song)?.section.id).toBe("z-transpose");
  });

  it("prefers a high-priority transpose part over a low-priority part in the same section", () => {
    const song = withTranspositionSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      transpositionPlan: "Low-priority voicing."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      transpositionPlan: "High-priority vocal drop."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTranspositionPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstTranspositionPlan(song)?.transpositionPlan).toBe("High-priority vocal drop.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withTranspositionSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      transpositionPlan: "ASCII transpose."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTranspositionPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstTranspositionPlan(song)?.transpositionPlan).toBe("ASCII transpose.");
  });

  it("skips a transposition plan whose graph node is inactive", () => {
    expect(resolveFirstTranspositionPlan(withTranspositionSection({ isActive: false }))).toBeNull();
  });

  it("skips a transposition plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstTranspositionPlan(withTranspositionSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a transposition plan whose end precedes its start", () => {
    expect(resolveFirstTranspositionPlan(withTranspositionSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length transposition-plan window", () => {
    expect(resolveFirstTranspositionPlan(withTranspositionSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a transposition plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstTranspositionPlan(
        withTranspositionSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstTranspositionPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withTranspositionSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("keeps the transposition plan unnamed when role identities are duplicated", () => {
    const song = withTranspositionSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstTranspositionPlan(song)).toBeNull();
  });

  it("bounds the transposition plan to 180 Unicode code points", () => {
    const song = withTranspositionSection({ transpositionPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstTranspositionPlan(song);
    expect(resolved?.transpositionPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the transposition-plan boundary", () => {
    const song = withTranspositionSection({ transpositionPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstTranspositionPlan(song);
    expect(Array.from(resolved?.transpositionPlan ?? "")).toHaveLength(180);
    expect(resolved?.transpositionPlan.endsWith("😀")).toBe(true);
  });
});
