import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatVoicingPlanTime, resolveFirstVoicingPlan } from "./firstVoicingPlan";

const DEMO_VOICING_PLAN =
  "Keep the verse voicing in first inversion so the top line still sings over the guitars.";

function withVoicingSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    voicingPlan?: string;
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
  section.id = overrides.id ?? "verse-voicing";
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
      voicingPlan:
        overrides.voicingPlan ??
        "Keep the verse voicing in first inversion so the top line still sings over the guitars.",
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

describe("resolveFirstVoicingPlan", () => {
  it("picks the demo song's earliest high-priority voicing plan and the part that owns it", () => {
    const resolved = resolveFirstVoicingPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("keys-right");
    expect(resolved?.voicingPlan).toBe(DEMO_VOICING_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatVoicingPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatVoicingPlanTime(Number.NaN)).toBe("0:00");
    expect(formatVoicingPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a voicing plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, tuning plans, dynamics plans, articulation plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withVoicingSection();
    delete song.sections[0]!.roles[0]!.voicingPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote =
      "Keep the verse voicing in first inversion so the top line still sings over the guitars.";
    song.sections[0]!.roles[0]!.transpositionPlan =
      "If the singer drops to B minor, keep the shape a whole step lower.";
    (song.sections[0]!.roles[0] as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
    (song.sections[0]!.roles[0] as { dynamicsPlan?: string }).dynamicsPlan =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
    (song.sections[0]!.roles[0] as { articulationPlan?: string }).articulationPlan =
      "Keep the verse attack short so the chorus still has a longer sustain to land on.";
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
      notes: "Keep the verse voicing in first inversion so the top line still sings over the guitars."
    };
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("skips a blank voicing plan", () => {
    expect(resolveFirstVoicingPlan(withVoicingSection({ voicingPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line voicing plan", () => {
    expect(
      resolveFirstVoicingPlan(withVoicingSection({ voicingPlan: "Drop under the vocal.\nKeep the pickup." }))
    ).toBeNull();
  });

  it("skips Unicode line separators and accepts BOM-padded voicing text", () => {
    for (const voicingPlan of ["Play\u0085here", "Play\u2028here", "Play\u2029here"]) {
      expect(resolveFirstVoicingPlan(withVoicingSection({ voicingPlan }))).toBeNull();
    }
    expect(resolveFirstVoicingPlan(withVoicingSection({ voicingPlan: "\uFEFF Play here \uFEFF" }))?.voicingPlan).toBe(
      "Play here"
    );
  });

  it("prefers the earlier of two voicing plans", () => {
    const song = withVoicingSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      voicingPlan: "Late voicing."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        voicingPlan: "Earlier voicing."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstVoicingPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.voicingPlan).toBe("Earlier voicing.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time voicing-plan ties with locale-independent id ordering", () => {
    const song = withVoicingSection({ id: "ä-voicing", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-voicing";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstVoicingPlan(song)?.section.id).toBe("z-voicing");
  });

  it("prefers a high-priority voicing part over a low-priority part in the same section", () => {
    const song = withVoicingSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      voicingPlan: "Low-priority voicing."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      voicingPlan: "High-priority voicing."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstVoicingPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstVoicingPlan(song)?.voicingPlan).toBe("High-priority voicing.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withVoicingSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      voicingPlan: "ASCII voicing."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstVoicingPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstVoicingPlan(song)?.voicingPlan).toBe("ASCII voicing.");
  });

  it("skips a voicing plan whose graph node is inactive", () => {
    expect(resolveFirstVoicingPlan(withVoicingSection({ isActive: false }))).toBeNull();
  });

  it("skips a voicing plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstVoicingPlan(withVoicingSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a voicing plan whose end precedes its start", () => {
    expect(resolveFirstVoicingPlan(withVoicingSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length voicing-plan window", () => {
    expect(resolveFirstVoicingPlan(withVoicingSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a voicing plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstVoicingPlan(
        withVoicingSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstVoicingPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withVoicingSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("keeps the voicing plan unnamed when role identities are duplicated", () => {
    const song = withVoicingSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstVoicingPlan(song)).toBeNull();
  });

  it("bounds the voicing plan to 180 Unicode code points", () => {
    const song = withVoicingSection({ voicingPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstVoicingPlan(song);
    expect(resolved?.voicingPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the voicing-plan boundary", () => {
    const song = withVoicingSection({ voicingPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstVoicingPlan(song);
    expect(Array.from(resolved?.voicingPlan ?? "")).toHaveLength(180);
    expect(resolved?.voicingPlan.endsWith("😀")).toBe(true);
  });
});
