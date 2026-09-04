import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatFadePlanTime, resolveFirstFadePlan } from "./firstFadePlan";

const DEMO_FADE_PLAN = "Fade this part; let the next downbeat land quieter.";

function withFadeSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    previousStart?: number;
    fadePlan?: string;
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
  delete (keys as { fadePlan?: string }).fadePlan;
  delete (keys as { fadePlanSource?: string }).fadePlanSource;
  delete (vocal as { fadePlan?: string }).fadePlan;
  delete (vocal as { fadePlanSource?: string }).fadePlanSource;
  delete (bass as { fadePlan?: string }).fadePlan;
  delete (bass as { fadePlanSource?: string }).fadePlanSource;

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
    fadePlan: overrides.fadePlan ?? DEMO_FADE_PLAN,
    fadePlanSource: overrides.source ?? "model"
  };

  const current = structuredClone(verse);
  current.id = overrides.id ?? "chorus-fade";
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
    delete (role as { fadePlan?: string }).fadePlan;
    delete (role as { fadePlanSource?: string }).fadePlanSource;
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

describe("resolveFirstFadePlan", () => {
  it("picks the earliest fade plan and the part that quiets in place", () => {
    const resolved = resolveFirstFadePlan(withFadeSection());
    expect(resolved?.section.id).toBe("chorus-fade");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.fadePlan).toBe(DEMO_FADE_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatFadePlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatFadePlanTime(Number.NaN)).toBe("0:00");
    expect(formatFadePlanTime(-4)).toBe("0:00");
  });

  it("does not invent a fade plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, hit plans, cutoff plans, turnaround plans, pickup plans, breakdown plans, drop plans, swell plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withFadeSection();
    delete song.sections[1]!.roles.find((role) => role.id === "lead-vocal")!.fadePlan;
    const landing = song.sections[1]!.roles.find((role) => role.id === "lead-vocal")!;
    song.sections[1]!.groove = "Straight eighths with a late snare feel";
    landing.simplification = "Stay on roots if the chorus entrance gets muddy.";
    landing.setupNote = DEMO_FADE_PLAN;
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
      notes: DEMO_FADE_PLAN
    };
    expect(resolveFirstFadePlan(song)).toBeNull();
  });

  it("skips a blank fade plan", () => {
    expect(resolveFirstFadePlan(withFadeSection({ fadePlan: "   " }))).toBeNull();
  });

  it("skips a multi-line fade plan", () => {
    expect(
      resolveFirstFadePlan(withFadeSection({ fadePlan: "Grow together.\nLeave the stack." }))
    ).toBeNull();
  });

  it("preserves long user-authored fade copy verbatim", () => {
    const fadePlan = `${"Fade together. ".repeat(20)}Keep the landing clear.`;
    expect(
      resolveFirstFadePlan(withFadeSection({ fadePlan, source: "user" }))?.fadePlan
    ).toBe(fadePlan);
  });

  it("prefers the earlier of two fade plans", () => {
    const song = withFadeSection({
      id: "chorus-late-fade",
      start: 40,
      end: 56,
      previousStart: 24,
      roleId: "lead-vocal",
      fadePlan: "Late fade.",
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
        fadePlan: "Earlier fade."
      },
      ...earlier.roles.filter((role) => role.id !== "lead-vocal")
    ];
    earlier.timeRange = { start: 8, end: 24 };
    const earlierHold = structuredClone(song.sections[0]!);
    earlierHold.id = "verse-before-early";
    earlierHold.timeRange = { start: 0, end: 8 };
    song.sections[0]!.timeRange = { start: 24, end: 40 };
    song.sections = [earlierHold, earlier, song.sections[0]!, song.sections[1]!];

    const resolved = resolveFirstFadePlan(song);
    expect(resolved?.section.id).toBe("chorus-early");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.fadePlan).toBe("Earlier fade.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time fade-plan ties with locale-independent id ordering", () => {
    const song = withFadeSection({ id: "ä-fade", start: 10, end: 26 });
    const umlautHold = song.sections[0]!;
    const umlaut = song.sections[1]!;
    const asciiHold = structuredClone(umlautHold);
    asciiHold.id = "z-fade-hold";
    const ascii = structuredClone(umlaut);
    ascii.id = "z-fade";
    song.sections = [umlautHold, umlaut, asciiHold, ascii];

    expect(resolveFirstFadePlan(song)?.section.id).toBe("z-fade");
  });

  it("prefers a high-priority landing part over a low-priority part in the same section", () => {
    const song = withFadeSection({
      roleId: "bass-guitar",
      roleName: "Bass Guitar",
      priority: "low",
      fadePlan: "Low-priority fade.",
      source: "user"
    });
    const section = song.sections[1]!;
    const highRole = {
      ...section.roles.find((role) => role.id === "lead-vocal")!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      fadePlan: "High-priority fade.",
      fadePlanSource: "user" as const
    };
    section.roles = [...section.roles.filter((role) => role.id !== "lead-vocal"), highRole];
    section.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstFadePlan(song)?.landingRole.id).toBe("lead-vocal");
    expect(resolveFirstFadePlan(song)?.fadePlan).toBe("High-priority fade.");
  });

  it("skips a fade plan whose graph node is inactive", () => {
    expect(resolveFirstFadePlan(withFadeSection({ isActive: false }))).toBeNull();
  });

  it("skips a fade plan whose previous graph node was inactive", () => {
    expect(resolveFirstFadePlan(withFadeSection({ wasActive: false }))).toBeNull();
  });

  it("skips a fade whose previous graph did not already include the landing", () => {
    expect(resolveFirstFadePlan(withFadeSection({ previousVocalActive: false }))).toBeNull();
  });

  it("skips a fade plan whose rest and landing windows do not abut", () => {
    const song = withFadeSection({ start: 12 });
    song.sections[0]!.timeRange = { start: 0, end: 10 };
    expect(resolveFirstFadePlan(song)).toBeNull();
  });

  it("skips a fade plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstFadePlan(withFadeSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a fade plan whose end precedes its start", () => {
    expect(resolveFirstFadePlan(withFadeSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length fade-plan window", () => {
    expect(resolveFirstFadePlan(withFadeSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a fade plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstFadePlan(
        withFadeSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstFadePlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a landing part", () => {
    const song = withFadeSection();
    song.sections[1]!.roles = [null as never, ...song.sections[1]!.roles];
    song.sections[1]!.partGraph = [null as never, ...song.sections[1]!.partGraph];
    expect(resolveFirstFadePlan(song)?.landingRole.id).toBe("lead-vocal");
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withFadeSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstFadePlan(song)).toBeNull();
  });

  it("keeps the fade plan unnamed when role identities are duplicated", () => {
    const song = withFadeSection();
    const role = song.sections[1]!.roles.find((item) => item.id === "lead-vocal")!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstFadePlan(song)).toBeNull();
  });

  it("does not name a density fill as a fade", () => {
    const song = withFadeSection({ previousVocalActive: false });
    song.sections[1]!.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstFadePlan(song)).toBeNull();
  });

  it("does not name a density drop as a fade", () => {
    const song = withFadeSection();
    song.sections[1]!.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstFadePlan(song)).toBeNull();
  });
});
