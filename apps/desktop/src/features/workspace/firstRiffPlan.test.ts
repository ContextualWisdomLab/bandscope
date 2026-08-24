import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatRiffPlanTime, resolveFirstRiffPlan } from "./firstRiffPlan";

const DEMO_RIFF_PLAN =
  "Bass locks the verse riff on the open fifth; keep it dry before the chorus lift.";

function withRiffSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    riffPlan?: string;
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
  section.id = overrides.id ?? "verse-riff";
  section.label = overrides.label ?? "verse";
  section.groove = "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const roleId = overrides.roleId ?? "bass-guitar";
  section.roles = [
    {
      ...verse.roles[0]!,
      id: roleId,
      name: overrides.roleName ?? "Bass Guitar",
      rehearsalPriority: overrides.priority ?? "medium",
      cue: { kind: "transition", value: "Hold through the pickup before the downbeat." },
      range: { lowestNote: "C#2", highestNote: "E3" },
      setupNote: "Keep the attack short so the verse breathes.",
      simplification: "Stay on roots if the chorus entrance gets muddy.",
      overlapWarnings: ["Density warning: competing with Keyboard Left Hand in low register."],
      harmony: {
        chord: "C#m7",
        functionLabel: overrides.functionLabel ?? "vi pedal anchor",
        source: "model"
      },
      harmonicExplanation:
        "The bass holds the vi center so the rest of the section can lean into the pickup without losing the tonal floor.",
      confidence: {
        level: "medium",
        source: "model",
        notes: "Watch the slide into the turnaround."
      },
      riffPlan: overrides.riffPlan ?? DEMO_RIFF_PLAN,
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

describe("resolveFirstRiffPlan", () => {
  it("picks the demo song's earliest riff plan and the part that owns it", () => {
    const resolved = resolveFirstRiffPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.riffPlan).toBe(DEMO_RIFF_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatRiffPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatRiffPlanTime(Number.NaN)).toBe("0:00");
    expect(formatRiffPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a riff plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, fill plans, tuning plans, dynamics plans, articulation plans, voicing plans, hook plans, capo plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withRiffSection();
    delete song.sections[0]!.roles[0]!.riffPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Stay on roots if the chorus entrance gets muddy.";
    song.sections[0]!.roles[0]!.setupNote = DEMO_RIFF_PLAN;
    song.sections[0]!.roles[0]!.transpositionPlan =
      "If the singer drops to B minor, keep the shape a whole step lower.";
    (song.sections[0]!.roles[0] as { fillPlan?: string }).fillPlan =
      "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";
    (song.sections[0]!.roles[0] as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
    (song.sections[0]!.roles[0] as { dynamicsPlan?: string }).dynamicsPlan =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
    (song.sections[0]!.roles[0] as { articulationPlan?: string }).articulationPlan =
      "Shorten the last chorus vowel so the band can hear the cutoff.";
    (song.sections[0]!.roles[0] as { voicingPlan?: string }).voicingPlan =
      "Keep the third out of the left hand so the bass owns the floor.";
    (song.sections[0]!.roles[0] as { hookPlan?: string }).hookPlan =
      "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";
    (song.sections[0]!.roles[0] as { capoPlan?: string }).capoPlan =
      "Capo 2 keeps the open-string riff under the singer.";
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup before the downbeat." };
    song.sections[0]!.roles[0]!.range = { lowestNote: "C#2", highestNote: "E3" };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Density warning: competing with Keyboard Left Hand in low register."];
    song.sections[0]!.roles[0]!.harmony = {
      chord: "C#m7",
      functionLabel: "vi pedal anchor",
      source: "user"
    };
    song.sections[0]!.roles[0]!.harmonicExplanation = "The bass holds the vi center.";
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
      notes: DEMO_RIFF_PLAN
    };
    expect(resolveFirstRiffPlan(song)).toBeNull();
  });

  it("skips a blank riff plan", () => {
    expect(resolveFirstRiffPlan(withRiffSection({ riffPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line riff plan", () => {
    expect(
      resolveFirstRiffPlan(withRiffSection({ riffPlan: "Keep the riff centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("prefers the earlier of two riff plans", () => {
    const song = withRiffSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      riffPlan: "Late riff."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "low",
        riffPlan: "Earlier riff."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstRiffPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.riffPlan).toBe("Earlier riff.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time riff-plan ties with locale-independent id ordering", () => {
    const song = withRiffSection({ id: "ä-riff", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-riff";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstRiffPlan(song)?.section.id).toBe("z-riff");
  });

  it("prefers a high-priority riff part over a low-priority part in the same section", () => {
    const song = withRiffSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      riffPlan: "Low-priority riff."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high" as const,
      riffPlan: "High-priority riff."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstRiffPlan(song)?.holdingRole.id).toBe("bass-guitar");
    expect(resolveFirstRiffPlan(song)?.riffPlan).toBe("High-priority riff.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withRiffSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      riffPlan: "ASCII riff."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstRiffPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstRiffPlan(song)?.riffPlan).toBe("ASCII riff.");
  });

  it("skips a riff plan whose graph node is inactive", () => {
    expect(resolveFirstRiffPlan(withRiffSection({ isActive: false }))).toBeNull();
  });

  it("skips a riff plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstRiffPlan(withRiffSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a riff plan whose end precedes its start", () => {
    expect(resolveFirstRiffPlan(withRiffSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length riff-plan window", () => {
    expect(resolveFirstRiffPlan(withRiffSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a riff plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstRiffPlan(
        withRiffSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstRiffPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withRiffSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstRiffPlan(song)).toBeNull();
  });

  it("keeps the riff plan unnamed when role identities are duplicated", () => {
    const song = withRiffSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstRiffPlan(song)).toBeNull();
  });

  it("bounds the riff plan to 180 Unicode code points", () => {
    const song = withRiffSection({ riffPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstRiffPlan(song);
    expect(resolved?.riffPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the riff-plan boundary", () => {
    const song = withRiffSection({ riffPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstRiffPlan(song);
    expect(Array.from(resolved?.riffPlan ?? "")).toHaveLength(180);
    expect(resolved?.riffPlan.endsWith("😀")).toBe(true);
  });
});
