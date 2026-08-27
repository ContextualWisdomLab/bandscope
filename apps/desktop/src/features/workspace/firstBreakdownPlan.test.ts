import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatBreakdownPlanTime, resolveFirstBreakdownPlan } from "./firstBreakdownPlan";

const DEMO_BREAKDOWN_PLAN = "Hold this breakdown; keep it sparse until the drop.";

function withBreakdownSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    previousStart?: number;
    breakdownPlan?: string;
    label?: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    wasActive?: boolean;
    previousActiveCount?: 3 | 2;
    keepCompanion?: boolean;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const landingStart = overrides.start ?? 10;
  const previousStart = overrides.previousStart ?? 0;
  const roleId = overrides.roleId ?? "bass-guitar";
  const keys = structuredClone(verse.roles.find((role) => role.id === "keys-right")!);
  const vocal = structuredClone(verse.roles.find((role) => role.id === "lead-vocal")!);
  const bass = structuredClone(verse.roles.find((role) => role.id === "bass-guitar")!);
  delete keys.breakdownPlan;
  delete keys.breakdownPlanSource;
  delete vocal.breakdownPlan;
  delete vocal.breakdownPlanSource;

  const holding = {
    ...(roleId === "keys-right" ? keys : roleId === "lead-vocal" ? vocal : bass),
    id: roleId,
    name: overrides.roleName ?? (roleId === "keys-right" ? "Keyboard 1 Right Hand" : roleId === "lead-vocal" ? "Lead Vocal" : "Bass Guitar"),
    rehearsalPriority: overrides.priority ?? "high",
    breakdownPlan: overrides.breakdownPlan ?? DEMO_BREAKDOWN_PLAN
  };

  const current = structuredClone(verse);
  current.id = overrides.id ?? "verse-breakdown";
  current.label = overrides.label ?? "verse";
  current.timeRange = { start: landingStart, end: overrides.end ?? landingStart + 20 };
  current.roles = overrides.keepCompanion ? [holding, keys] : [holding];
  current.partGraph = [
    { role_id: "bass-guitar", is_active: roleId === "bass-guitar" ? (overrides.isActive ?? true) : Boolean(overrides.keepCompanion && roleId !== "bass-guitar"), handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: roleId === "keys-right" ? (overrides.isActive ?? true) : Boolean(overrides.keepCompanion), handoff_to: [], handoff_from: [] },
    { role_id: "lead-vocal", is_active: roleId === "lead-vocal" ? (overrides.isActive ?? true) : false, handoff_to: [], handoff_from: [] }
  ];
  if (overrides.keepCompanion && roleId === "bass-guitar") {
    current.partGraph[1]!.is_active = true;
  }
  if (overrides.keepCompanion && roleId === "keys-right") {
    current.partGraph[0]!.is_active = true;
    current.roles = [holding, bass];
  }

  const previous = structuredClone(current);
  previous.id = `${current.id}-full`;
  previous.label = "intro";
  previous.timeRange = { start: previousStart, end: landingStart };
  previous.roles = [structuredClone(bass), structuredClone(keys), structuredClone(vocal)];
  previous.roles.forEach((role) => {
    delete role.breakdownPlan;
    delete role.breakdownPlanSource;
  });
  previous.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    {
      role_id: "lead-vocal",
      is_active: overrides.previousActiveCount === 2 ? false : true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  if (overrides.wasActive === false) {
    previous.partGraph = previous.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === roleId ? false : node.is_active
    }));
  }

  song.sections = [previous, current];
  return song;
}

describe("resolveFirstBreakdownPlan", () => {
  it("picks the earliest breakdown plan and the part that holds the sparse texture", () => {
    const resolved = resolveFirstBreakdownPlan(withBreakdownSection());
    expect(resolved?.section.id).toBe("verse-breakdown");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.breakdownPlan).toBe(DEMO_BREAKDOWN_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatBreakdownPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatBreakdownPlanTime(Number.NaN)).toBe("0:00");
    expect(formatBreakdownPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a breakdown plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, hit plans, cutoff plans, turnaround plans, pickup plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withBreakdownSection();
    delete song.sections[1]!.roles[0]!.breakdownPlan;
    song.sections[1]!.groove = "Straight eighths with a late snare feel";
    song.sections[1]!.roles[0]!.simplification = "Stay on roots if the chorus entrance gets muddy.";
    song.sections[1]!.roles[0]!.setupNote = DEMO_BREAKDOWN_PLAN;
    song.sections[1]!.roles[0]!.transpositionPlan =
      "If the singer drops to B minor, keep the shape a whole step lower.";
    (song.sections[1]!.roles[0] as { vampPlan?: string }).vampPlan =
      "Keep this part going until Lead Vocal enters in the next section.";
    (song.sections[1]!.roles[0] as { fillPlan?: string }).fillPlan =
      "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";
    (song.sections[1]!.roles[0] as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
    (song.sections[1]!.roles[0] as { dynamicsPlan?: string }).dynamicsPlan =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
    (song.sections[1]!.roles[0] as { articulationPlan?: string }).articulationPlan =
      "Shorten the last chorus vowel so the band can hear the pickup.";
    (song.sections[1]!.roles[0] as { hookPlan?: string }).hookPlan =
      "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";
    (song.sections[1]!.roles[0] as { soloPlan?: string }).soloPlan =
      "Hold the verse solo; everyone else drops to a two-bar pad so the run can land.";
    (song.sections[1]!.roles[0] as { padPlan?: string }).padPlan =
      "Drop to a two-bar pad so the Keyboard 1 Right Hand run can land.";
    (song.sections[1]!.roles[0] as { hitPlan?: string }).hitPlan =
      "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.";
    (song.sections[1]!.roles[0] as { cutoffPlan?: string }).cutoffPlan =
      "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup.";
    (song.sections[1]!.roles[0] as { turnaroundPlan?: string }).turnaroundPlan =
      "Turn these last bars with Lead Vocal; land the downbeat together.";
    (song.sections[1]!.roles[0] as { pickupPlan?: string }).pickupPlan =
      "Play this pickup with Lead Vocal; land the downbeat together.";
    song.sections[1]!.roles[0]!.cue = { kind: "lyric", value: "city lights" };
    song.sections[1]!.roles[0]!.range = { lowestNote: "C#2", highestNote: "E3" };
    song.sections[1]!.roles[0]!.overlapWarnings = [
      "Density warning: competing with Keyboard Left Hand in low register."
    ];
    song.sections[1]!.roles[0]!.harmony = {
      chord: "C#m7",
      functionLabel: "vi pedal anchor",
      source: "user"
    };
    song.sections[1]!.roles[0]!.harmonicExplanation = "The bass holds the vi center.";
    song.sections[1]!.roles[0]!.manualOverrides = [
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
    song.sections[1]!.roles[0]!.confidence = {
      level: "high",
      source: "user",
      notes: DEMO_BREAKDOWN_PLAN
    };
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("skips a blank breakdown plan", () => {
    expect(resolveFirstBreakdownPlan(withBreakdownSection({ breakdownPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line breakdown plan", () => {
    expect(
      resolveFirstBreakdownPlan(
        withBreakdownSection({ breakdownPlan: "Keep the texture sparse.\nLeave the stack." })
      )
    ).toBeNull();
  });

  it("prefers the earlier of two breakdown plans", () => {
    const song = withBreakdownSection({
      id: "verse-late-breakdown",
      start: 40,
      end: 56,
      previousStart: 24,
      roleId: "keys-right",
      breakdownPlan: "Late breakdown."
    });
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "bass-guitar",
        name: "Bass Guitar",
        rehearsalPriority: "low",
        breakdownPlan: "Earlier breakdown."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];
    const earlierFull = structuredClone(song.sections[0]!);
    earlierFull.id = "intro-before-early";
    earlierFull.timeRange = { start: 0, end: 8 };
    song.sections = [earlierFull, earlier, song.sections[0]!, song.sections[1]!];

    const resolved = resolveFirstBreakdownPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.breakdownPlan).toBe("Earlier breakdown.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time breakdown-plan ties with locale-independent id ordering", () => {
    const song = withBreakdownSection({ id: "ä-breakdown", start: 10, end: 26 });
    const umlautFull = song.sections[0]!;
    const umlaut = song.sections[1]!;
    const asciiFull = structuredClone(umlautFull);
    asciiFull.id = "z-breakdown-full";
    const ascii = structuredClone(umlaut);
    ascii.id = "z-breakdown";
    song.sections = [umlautFull, umlaut, asciiFull, ascii];

    expect(resolveFirstBreakdownPlan(song)?.section.id).toBe("z-breakdown");
  });

  it("prefers a high-priority holding part over a low-priority part in the same section", () => {
    const song = withBreakdownSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      breakdownPlan: "Low-priority breakdown.",
      keepCompanion: true
    });
    const section = song.sections[1]!;
    const highRole = {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high" as const,
      breakdownPlan: "High-priority breakdown."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstBreakdownPlan(song)?.holdingRole.id).toBe("bass-guitar");
    expect(resolveFirstBreakdownPlan(song)?.breakdownPlan).toBe("High-priority breakdown.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withBreakdownSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high", keepCompanion: true });
    const section = song.sections[1]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      breakdownPlan: "ASCII breakdown."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];
    const previous = song.sections[0]!;
    previous.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstBreakdownPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstBreakdownPlan(song)?.breakdownPlan).toBe("ASCII breakdown.");
  });

  it("skips a breakdown plan whose graph node is inactive", () => {
    expect(resolveFirstBreakdownPlan(withBreakdownSection({ isActive: false }))).toBeNull();
  });

  it("skips a breakdown plan whose previous graph node was already inactive", () => {
    expect(resolveFirstBreakdownPlan(withBreakdownSection({ wasActive: false }))).toBeNull();
  });

  it("skips a breakdown whose previous graph had fewer than three sources", () => {
    expect(resolveFirstBreakdownPlan(withBreakdownSection({ previousActiveCount: 2 }))).toBeNull();
  });

  it("skips a breakdown plan whose rest and landing windows do not abut", () => {
    const song = withBreakdownSection({ start: 12 });
    song.sections[0]!.timeRange = { start: 0, end: 10 };
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("skips a breakdown plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstBreakdownPlan(withBreakdownSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a breakdown plan whose end precedes its start", () => {
    expect(resolveFirstBreakdownPlan(withBreakdownSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length breakdown-plan window", () => {
    expect(resolveFirstBreakdownPlan(withBreakdownSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a breakdown plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstBreakdownPlan(
        withBreakdownSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstBreakdownPlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a holding part", () => {
    const song = withBreakdownSection();
    song.sections[1]!.roles = [null as never, song.sections[1]!.roles[0]!];
    song.sections[1]!.partGraph = [null as never, ...song.sections[1]!.partGraph];
    expect(resolveFirstBreakdownPlan(song)?.holdingRole.id).toBe("bass-guitar");
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withBreakdownSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("keeps the breakdown plan unnamed when role identities are duplicated", () => {
    const song = withBreakdownSection();
    const role = song.sections[1]!.roles[0]!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("does not name a full stop as a breakdown", () => {
    const song = withBreakdownSection();
    song.sections[1]!.partGraph = song.sections[1]!.partGraph.map((node) => ({
      ...node,
      is_active: false
    }));
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("does not name an unchanged dense texture as a breakdown", () => {
    const song = withBreakdownSection();
    song.sections[1]!.partGraph = song.sections[0]!.partGraph.map((node) => ({ ...node }));
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });

  it("does not name a new entrance as a breakdown", () => {
    const song = withBreakdownSection({ wasActive: false });
    song.sections[1]!.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstBreakdownPlan(song)).toBeNull();
  });
});
