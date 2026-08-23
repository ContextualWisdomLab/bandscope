import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatArticulationPlanTime, resolveFirstArticulationPlan } from "./firstArticulationPlan";

const DEMO_ARTICULATION_PLAN =
  "Keep the verse attack short so the chorus still has a longer sustain to land on.";

function withArticulationSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    articulationPlan?: string;
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
  section.id = overrides.id ?? "verse-articulation";
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
      articulationPlan:
        overrides.articulationPlan ??
        "Keep the verse attack short so the chorus still has a longer sustain to land on.",
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

describe("resolveFirstArticulationPlan", () => {
  it("picks the demo song's earliest high-priority articulation plan and the part that owns it", () => {
    const resolved = resolveFirstArticulationPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.articulationPlan).toBe(DEMO_ARTICULATION_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatArticulationPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatArticulationPlanTime(Number.NaN)).toBe("0:00");
    expect(formatArticulationPlanTime(-4)).toBe("0:00");
  });

  it("does not invent an articulation plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, tuning plans, dynamics plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withArticulationSection();
    delete song.sections[0]!.roles[0]!.articulationPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote =
      "Keep the verse attack short so the chorus still has a longer sustain to land on.";
    song.sections[0]!.roles[0]!.transpositionPlan =
      "If the singer drops to B minor, keep the shape a whole step lower.";
    (song.sections[0]!.roles[0] as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
    (song.sections[0]!.roles[0] as { dynamicsPlan?: string }).dynamicsPlan =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
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
      notes: "Keep the verse attack short so the chorus still has a longer sustain to land on."
    };
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("skips a blank articulation plan", () => {
    expect(resolveFirstArticulationPlan(withArticulationSection({ articulationPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line articulation plan", () => {
    expect(
      resolveFirstArticulationPlan(withArticulationSection({ articulationPlan: "Drop under the vocal.\nKeep the pickup." }))
    ).toBeNull();
  });

  it("prefers the earlier of two articulation plans", () => {
    const song = withArticulationSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      articulationPlan: "Late articulation."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        articulationPlan: "Earlier articulation."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstArticulationPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.articulationPlan).toBe("Earlier articulation.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time articulation-plan ties with locale-independent id ordering", () => {
    const song = withArticulationSection({ id: "ä-articulation", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-articulation";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstArticulationPlan(song)?.section.id).toBe("z-articulation");
  });

  it("prefers a high-priority articulation part over a low-priority part in the same section", () => {
    const song = withArticulationSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      articulationPlan: "Low-priority articulation."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      articulationPlan: "High-priority articulation."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstArticulationPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstArticulationPlan(song)?.articulationPlan).toBe("High-priority articulation.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withArticulationSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      articulationPlan: "ASCII articulation."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstArticulationPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstArticulationPlan(song)?.articulationPlan).toBe("ASCII articulation.");
  });

  it("skips an articulation plan whose graph node is inactive", () => {
    expect(resolveFirstArticulationPlan(withArticulationSection({ isActive: false }))).toBeNull();
  });

  it("skips an articulation plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstArticulationPlan(withArticulationSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips an articulation plan whose end precedes its start", () => {
    expect(resolveFirstArticulationPlan(withArticulationSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length articulation-plan window", () => {
    expect(resolveFirstArticulationPlan(withArticulationSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips an articulation plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstArticulationPlan(
        withArticulationSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstArticulationPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withArticulationSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("keeps the articulation plan unnamed when role identities are duplicated", () => {
    const song = withArticulationSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstArticulationPlan(song)).toBeNull();
  });

  it("bounds the articulation plan to 180 Unicode code points", () => {
    const song = withArticulationSection({ articulationPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstArticulationPlan(song);
    expect(resolved?.articulationPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the articulation-plan boundary", () => {
    const song = withArticulationSection({ articulationPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstArticulationPlan(song);
    expect(Array.from(resolved?.articulationPlan ?? "")).toHaveLength(180);
    expect(resolved?.articulationPlan.endsWith("😀")).toBe(true);
  });
});
