import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatDropPlanTime, resolveFirstDropPlan } from "./firstDropPlan";

const DEMO_DROP_PLAN = "Hit this drop; come in together when the texture fills.";

function withDropSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    previousStart?: number;
    dropPlan?: string;
    label?:
      | "intro"
      | "verse"
      | "pre-chorus"
      | "chorus"
      | "bridge"
      | "outro"
      | "tag"
      | "pickup"
      | "stop"
      | "handoff";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    source?: "model" | "user";
    isActive?: boolean;
    wasActive?: boolean;
    previousActiveCount?: 1 | 2 | 3;
    keepCompanion?: boolean;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const landingStart = overrides.start ?? 10;
  const previousStart = overrides.previousStart ?? 0;
  const roleId = overrides.roleId ?? "lead-vocal";
  const keys = structuredClone(verse.roles.find((role) => role.id === "keys-right")!);
  const vocal = structuredClone(verse.roles.find((role) => role.id === "lead-vocal")!);
  const bass = structuredClone(verse.roles.find((role) => role.id === "bass-guitar")!);
  delete (keys as { dropPlan?: string }).dropPlan;
  delete (keys as { dropPlanSource?: string }).dropPlanSource;
  delete (vocal as { dropPlan?: string }).dropPlan;
  delete (vocal as { dropPlanSource?: string }).dropPlanSource;
  delete (bass as { dropPlan?: string }).dropPlan;
  delete (bass as { dropPlanSource?: string }).dropPlanSource;

  const landing = {
    ...(roleId === "keys-right" ? keys : roleId === "bass-guitar" ? bass : vocal),
    id: roleId,
    name:
      overrides.roleName ??
      (roleId === "keys-right"
        ? "Keyboard 1 Right Hand"
        : roleId === "bass-guitar"
          ? "Bass Guitar"
          : "Lead Vocal"),
    rehearsalPriority: overrides.priority ?? "high",
    dropPlan: overrides.dropPlan ?? DEMO_DROP_PLAN,
    dropPlanSource: overrides.source ?? "model"
  };

  const current = structuredClone(verse);
  current.id = overrides.id ?? "chorus-drop";
  current.label = overrides.label ?? "chorus";
  current.timeRange = { start: landingStart, end: overrides.end ?? landingStart + 20 };
  current.roles = overrides.keepCompanion ? [landing, bass] : [landing, bass, keys];
  current.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    {
      role_id: "lead-vocal",
      is_active: roleId === "lead-vocal" ? (overrides.isActive ?? true) : Boolean(overrides.keepCompanion),
      handoff_to: [],
      handoff_from: []
    }
  ];
  if (roleId === "keys-right") {
    current.partGraph[1]!.is_active = overrides.isActive ?? true;
    current.partGraph[2]!.is_active = true;
    current.roles = [landing, bass, vocal];
  }
  if (roleId === "bass-guitar") {
    current.partGraph[0]!.is_active = overrides.isActive ?? true;
    current.partGraph[2]!.is_active = true;
    current.roles = [landing, keys, vocal];
  }

  const previous = structuredClone(current);
  previous.id = `${current.id}-thin`;
  previous.label = "verse";
  previous.timeRange = { start: previousStart, end: landingStart };
  previous.roles = [structuredClone(bass), structuredClone(keys)];
  previous.roles.forEach((role) => {
    delete (role as { dropPlan?: string }).dropPlan;
    delete (role as { dropPlanSource?: string }).dropPlanSource;
  });
  const previousVocalActive = overrides.previousActiveCount === 3;
  const previousKeysActive = overrides.previousActiveCount !== 1;
  previous.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    {
      role_id: "keys-right",
      is_active: previousKeysActive,
      handoff_to: [],
      handoff_from: []
    },
    {
      role_id: "lead-vocal",
      is_active: previousVocalActive,
      handoff_to: [],
      handoff_from: []
    }
  ];
  if (overrides.wasActive === true) {
    previous.partGraph = previous.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id === roleId ? true : node.is_active
    }));
  }

  song.sections = [previous, current];
  return song;
}

describe("resolveFirstDropPlan", () => {
  it("picks the earliest drop plan and the part that lands the filled texture", () => {
    const resolved = resolveFirstDropPlan(withDropSection());
    expect(resolved?.section.id).toBe("chorus-drop");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.dropPlan).toBe(DEMO_DROP_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatDropPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatDropPlanTime(Number.NaN)).toBe("0:00");
    expect(formatDropPlanTime(-4)).toBe("0:00");
  });

  it("preserves long user-authored drop guidance verbatim", () => {
    const dropPlan = `Hit this drop with ${"A".repeat(170)}; come in together when the texture fills.`;
    const resolved = resolveFirstDropPlan(withDropSection({ dropPlan, source: "user" }));

    expect(resolved?.dropPlanSource).toBe("user");
    expect(resolved?.dropPlan).toBe(dropPlan);
  });

  it("does not invent a drop plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, hit plans, cutoff plans, turnaround plans, pickup plans, breakdown plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withDropSection();
    delete song.sections[1]!.roles.find((role) => role.id === "lead-vocal")!.dropPlan;
    const landing = song.sections[1]!.roles.find((role) => role.id === "lead-vocal")!;
    song.sections[1]!.groove = "Straight eighths with a late snare feel";
    landing.simplification = "Stay on roots if the chorus entrance gets muddy.";
    landing.setupNote = DEMO_DROP_PLAN;
    landing.transpositionPlan = "If the singer drops to B minor, keep the shape a whole step lower.";
    (landing as { vampPlan?: string }).vampPlan =
      "Keep this part going until Lead Vocal enters in the next section.";
    (landing as { fillPlan?: string }).fillPlan =
      "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";
    (landing as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
    (landing as { dynamicsPlan?: string }).dynamicsPlan =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
    (landing as { articulationPlan?: string }).articulationPlan =
      "Shorten the last chorus vowel so the band can hear the pickup.";
    (landing as { hookPlan?: string }).hookPlan =
      "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";
    (landing as { soloPlan?: string }).soloPlan =
      "Hold the verse solo; everyone else drops to a two-bar pad so the run can land.";
    (landing as { padPlan?: string }).padPlan =
      "Drop to a two-bar pad so the Keyboard 1 Right Hand run can land.";
    (landing as { hitPlan?: string }).hitPlan =
      "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.";
    (landing as { cutoffPlan?: string }).cutoffPlan =
      "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup.";
    (landing as { turnaroundPlan?: string }).turnaroundPlan =
      "Turn these last bars with Lead Vocal; land the downbeat together.";
    (landing as { pickupPlan?: string }).pickupPlan =
      "Play this pickup with Lead Vocal; land the downbeat together.";
    (landing as { breakdownPlan?: string }).breakdownPlan =
      "Hold this breakdown; keep it sparse until the drop.";
    landing.cue = { kind: "lyric", value: "city lights" };
    landing.range = { lowestNote: "G#3", highestNote: "C#5" };
    landing.overlapWarnings = [
      "Density warning: competing with Keyboard Left Hand in low register."
    ];
    landing.harmony = {
      chord: "C#m7",
      functionLabel: "vi pedal anchor",
      source: "user"
    };
    landing.harmonicExplanation = "The vocal lands the chorus center.";
    landing.manualOverrides = [
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
    landing.confidence = {
      level: "high",
      source: "user",
      notes: DEMO_DROP_PLAN
    };
    expect(resolveFirstDropPlan(song)).toBeNull();
  });

  it("skips a blank drop plan", () => {
    expect(resolveFirstDropPlan(withDropSection({ dropPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line drop plan", () => {
    expect(
      resolveFirstDropPlan(withDropSection({ dropPlan: "Come in together.\nLeave the stack." }))
    ).toBeNull();
  });

  it("prefers the earlier of two drop plans", () => {
    const song = withDropSection({
      id: "chorus-late-drop",
      start: 40,
      end: 56,
      previousStart: 24,
      roleId: "lead-vocal",
      dropPlan: "Late drop.",
      source: "user"
    });
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "chorus-early";
    earlier.roles = [
      {
        ...earlier.roles.find((role) => role.id === "lead-vocal")!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        dropPlan: "Earlier drop.",
        dropPlanSource: "user"
      },
      ...earlier.roles.filter((role) => role.id !== "lead-vocal")
    ];
    earlier.timeRange = { start: 8, end: 24 };
    const earlierThin = structuredClone(song.sections[0]!);
    earlierThin.id = "verse-before-early";
    earlierThin.timeRange = { start: 0, end: 8 };
    song.sections[0]!.timeRange = { start: 24, end: 40 };
    song.sections = [earlierThin, earlier, song.sections[0]!, song.sections[1]!];

    const resolved = resolveFirstDropPlan(song);
    expect(resolved?.section.id).toBe("chorus-early");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.dropPlan).toBe("Earlier drop.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time drop-plan ties with locale-independent id ordering", () => {
    const song = withDropSection({ id: "ä-drop", start: 10, end: 26 });
    const umlautThin = song.sections[0]!;
    const umlaut = song.sections[1]!;
    const asciiThin = structuredClone(umlautThin);
    asciiThin.id = "z-drop-thin";
    const ascii = structuredClone(umlaut);
    ascii.id = "z-drop";
    song.sections = [umlautThin, umlaut, asciiThin, ascii];

    expect(resolveFirstDropPlan(song)?.section.id).toBe("z-drop");
  });

  it("prefers a high-priority landing part over a low-priority part in the same section", () => {
    const song = withDropSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      dropPlan: "Low-priority drop.",
      source: "user"
    });
    const section = song.sections[1]!;
    const highRole = {
      ...section.roles.find((role) => role.id === "lead-vocal")!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      dropPlan: "High-priority drop.",
      dropPlanSource: "user" as const
    };
    section.roles = [...section.roles.filter((role) => role.id !== "lead-vocal"), highRole];
    section.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstDropPlan(song)?.landingRole.id).toBe("lead-vocal");
    expect(resolveFirstDropPlan(song)?.dropPlan).toBe("High-priority drop.");
  });

  it("skips a drop plan whose graph node is inactive", () => {
    expect(resolveFirstDropPlan(withDropSection({ isActive: false }))).toBeNull();
  });

  it("skips a drop plan whose previous graph node was already active", () => {
    expect(resolveFirstDropPlan(withDropSection({ wasActive: true, previousActiveCount: 3 }))).toBeNull();
  });

  it("skips a drop whose previous graph already had three sources", () => {
    expect(resolveFirstDropPlan(withDropSection({ previousActiveCount: 3 }))).toBeNull();
  });

  it("skips a drop plan whose rest and landing windows do not abut", () => {
    const song = withDropSection({ start: 12 });
    song.sections[0]!.timeRange = { start: 0, end: 10 };
    expect(resolveFirstDropPlan(song)).toBeNull();
  });

  it("skips a drop plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstDropPlan(withDropSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a drop plan whose end precedes its start", () => {
    expect(resolveFirstDropPlan(withDropSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length drop-plan window", () => {
    expect(resolveFirstDropPlan(withDropSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a drop plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstDropPlan(
        withDropSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstDropPlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a landing part", () => {
    const song = withDropSection();
    song.sections[1]!.roles = [null as never, ...song.sections[1]!.roles];
    song.sections[1]!.partGraph = [null as never, ...song.sections[1]!.partGraph];
    expect(resolveFirstDropPlan(song)?.landingRole.id).toBe("lead-vocal");
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withDropSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstDropPlan(song)).toBeNull();
  });

  it("keeps the drop plan unnamed when role identities are duplicated", () => {
    const song = withDropSection();
    const role = song.sections[1]!.roles.find((item) => item.id === "lead-vocal")!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstDropPlan(song)).toBeNull();
  });

  it("does not name a full stop as a drop", () => {
    const song = withDropSection();
    song.sections[1]!.partGraph = song.sections[1]!.partGraph.map((node) => ({
      ...node,
      is_active: false
    }));
    expect(resolveFirstDropPlan(song)).toBeNull();
  });

  it("does not name an unchanged dense texture as a drop", () => {
    const song = withDropSection({ previousActiveCount: 3 });
    song.sections[1]!.partGraph = song.sections[0]!.partGraph.map((node) => ({ ...node }));
    expect(resolveFirstDropPlan(song)).toBeNull();
  });

  it("does not name a density drop as a drop", () => {
    const song = withDropSection();
    song.sections[0]!.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    song.sections[1]!.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstDropPlan(song)).toBeNull();
  });
});
