import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatSwellPlanTime, resolveFirstSwellPlan } from "./firstSwellPlan";

const DEMO_SWELL_PLAN = "Swell this part; grow into the next downbeat.";

function withSwellSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    previousStart?: number;
    swellPlan?: string;
    swellPlanSource?: "model" | "user";
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
    isActive?: boolean;
    wasActive?: boolean;
    previousVocalActive?: boolean;
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
  delete (keys as { swellPlan?: string }).swellPlan;
  delete (keys as { swellPlanSource?: string }).swellPlanSource;
  delete (vocal as { swellPlan?: string }).swellPlan;
  delete (vocal as { swellPlanSource?: string }).swellPlanSource;
  delete (bass as { swellPlan?: string }).swellPlan;
  delete (bass as { swellPlanSource?: string }).swellPlanSource;

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
    swellPlan: overrides.swellPlan ?? DEMO_SWELL_PLAN,
    swellPlanSource: overrides.swellPlanSource ?? "user"
  };

  const current = structuredClone(verse);
  current.id = overrides.id ?? "chorus-swell";
  current.label = overrides.label ?? "chorus";
  current.timeRange = { start: landingStart, end: overrides.end ?? landingStart + 20 };
  current.roles = [landing, bass, keys];
  current.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    {
      role_id: "lead-vocal",
      is_active: roleId === "lead-vocal" ? (overrides.isActive ?? true) : true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  if (roleId === "keys-right") {
    current.partGraph[1]!.is_active = overrides.isActive ?? true;
    current.roles = [landing, bass, vocal];
  }
  if (roleId === "bass-guitar") {
    current.partGraph[0]!.is_active = overrides.isActive ?? true;
    current.roles = [landing, keys, vocal];
  }

  const previous = structuredClone(current);
  previous.id = `${current.id}-hold`;
  previous.label = "verse";
  previous.timeRange = { start: previousStart, end: landingStart };
  previous.roles = [structuredClone(bass), structuredClone(keys), structuredClone(vocal)];
  previous.roles.forEach((role) => {
    delete (role as { swellPlan?: string }).swellPlan;
    delete (role as { swellPlanSource?: string }).swellPlanSource;
  });
  const previousVocalActive = overrides.previousVocalActive ?? true;
  previous.partGraph = [
    { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
    { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
    {
      role_id: "lead-vocal",
      is_active: previousVocalActive,
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

describe("resolveFirstSwellPlan", () => {
  it("picks the earliest swell plan and the part that grows in place", () => {
    const resolved = resolveFirstSwellPlan(withSwellSection());
    expect(resolved?.section.id).toBe("chorus-swell");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.swellPlan).toBe(DEMO_SWELL_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatSwellPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatSwellPlanTime(Number.NaN)).toBe("0:00");
    expect(formatSwellPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a swell plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, hit plans, cutoff plans, turnaround plans, pickup plans, breakdown plans, drop plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withSwellSection();
    delete song.sections[1]!.roles.find((role) => role.id === "lead-vocal")!.swellPlan;
    const landing = song.sections[1]!.roles.find((role) => role.id === "lead-vocal")!;
    song.sections[1]!.groove = "Straight eighths with a late snare feel";
    landing.simplification = "Stay on roots if the chorus entrance gets muddy.";
    landing.setupNote = DEMO_SWELL_PLAN;
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
    (landing as { dropPlan?: string }).dropPlan =
      "Hit this drop; come in together when the texture fills.";
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
      notes: DEMO_SWELL_PLAN
    };
    expect(resolveFirstSwellPlan(song)).toBeNull();
  });

  it("skips a blank swell plan", () => {
    expect(resolveFirstSwellPlan(withSwellSection({ swellPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line swell plan", () => {
    expect(
      resolveFirstSwellPlan(withSwellSection({ swellPlan: "Grow together.\nLeave the stack." }))
    ).toBeNull();
  });

  it("preserves long user-authored swell copy verbatim", () => {
    const swellPlan = `${"Grow together. ".repeat(20)}Keep the landing clear.`;
    expect(
      resolveFirstSwellPlan(withSwellSection({ swellPlan, swellPlanSource: "user" }))?.swellPlan
    ).toBe(swellPlan);
  });

  it("prefers the earlier of two swell plans", () => {
    const song = withSwellSection({
      id: "chorus-late-swell",
      start: 40,
      end: 56,
      previousStart: 24,
      roleId: "lead-vocal",
      swellPlan: "Late swell."
    });
    const earlier = structuredClone(song.sections[1]!);
    earlier.id = "chorus-early";
    earlier.roles = [
      {
        ...earlier.roles.find((role) => role.id === "lead-vocal")!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        swellPlan: "Earlier swell.",
        swellPlanSource: "user"
      },
      ...earlier.roles.filter((role) => role.id !== "lead-vocal")
    ];
    earlier.timeRange = { start: 8, end: 24 };
    const earlierHold = structuredClone(song.sections[0]!);
    earlierHold.id = "verse-before-early";
    earlierHold.timeRange = { start: 0, end: 8 };
    song.sections[0]!.timeRange = { start: 24, end: 40 };
    song.sections = [earlierHold, earlier, song.sections[0]!, song.sections[1]!];

    const resolved = resolveFirstSwellPlan(song);
    expect(resolved?.section.id).toBe("chorus-early");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.swellPlan).toBe("Earlier swell.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time swell-plan ties with locale-independent id ordering", () => {
    const song = withSwellSection({ id: "ä-swell", start: 10, end: 26 });
    const umlautHold = song.sections[0]!;
    const umlaut = song.sections[1]!;
    const asciiHold = structuredClone(umlautHold);
    asciiHold.id = "z-swell-hold";
    const ascii = structuredClone(umlaut);
    ascii.id = "z-swell";
    song.sections = [umlautHold, umlaut, asciiHold, ascii];

    expect(resolveFirstSwellPlan(song)?.section.id).toBe("z-swell");
  });

  it("prefers a high-priority landing part over a low-priority part in the same section", () => {
    const song = withSwellSection({
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      priority: "low",
      swellPlan: "Low-priority swell."
    });
    const section = song.sections[1]!;
    const highRole = {
      ...section.roles.find((role) => role.id === "lead-vocal")!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      swellPlan: "High-priority swell.",
      swellPlanSource: "user"
    };
    section.roles = [...section.roles.filter((role) => role.id !== "lead-vocal"), highRole];
    section.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstSwellPlan(song)?.landingRole.id).toBe("lead-vocal");
    expect(resolveFirstSwellPlan(song)?.swellPlan).toBe("High-priority swell.");
  });

  it("skips a swell plan whose graph node is inactive", () => {
    expect(resolveFirstSwellPlan(withSwellSection({ isActive: false }))).toBeNull();
  });

  it("skips a swell plan whose previous graph node was inactive", () => {
    expect(resolveFirstSwellPlan(withSwellSection({ wasActive: false }))).toBeNull();
  });

  it("skips a swell whose previous graph did not already include the landing", () => {
    expect(resolveFirstSwellPlan(withSwellSection({ previousVocalActive: false }))).toBeNull();
  });

  it("skips a swell plan whose rest and landing windows do not abut", () => {
    const song = withSwellSection({ start: 12 });
    song.sections[0]!.timeRange = { start: 0, end: 10 };
    expect(resolveFirstSwellPlan(song)).toBeNull();
  });

  it("skips a swell plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstSwellPlan(withSwellSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a swell plan whose end precedes its start", () => {
    expect(resolveFirstSwellPlan(withSwellSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length swell-plan window", () => {
    expect(resolveFirstSwellPlan(withSwellSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a swell plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstSwellPlan(
        withSwellSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstSwellPlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a landing part", () => {
    const song = withSwellSection();
    song.sections[1]!.roles = [null as never, ...song.sections[1]!.roles];
    song.sections[1]!.partGraph = [null as never, ...song.sections[1]!.partGraph];
    expect(resolveFirstSwellPlan(song)?.landingRole.id).toBe("lead-vocal");
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withSwellSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstSwellPlan(song)).toBeNull();
  });

  it("keeps the swell plan unnamed when role identities are duplicated", () => {
    const song = withSwellSection();
    const role = song.sections[1]!.roles.find((item) => item.id === "lead-vocal")!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstSwellPlan(song)).toBeNull();
  });

  it("does not name a density fill as a swell", () => {
    const song = withSwellSection({ previousVocalActive: false });
    song.sections[1]!.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstSwellPlan(song)).toBeNull();
  });

  it("does not name a density drop as a swell", () => {
    const song = withSwellSection();
    song.sections[1]!.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstSwellPlan(song)).toBeNull();
  });
});
