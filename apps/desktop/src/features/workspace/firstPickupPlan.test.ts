import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatPickupPlanTime, resolveFirstPickupPlan } from "./firstPickupPlan";

const DEMO_PICKUP_PLAN = "Play this pickup with Lead Vocal; land the downbeat together.";

function withPickupSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    previousStart?: number;
    pickupPlan?: string;
    label?: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    wasActive?: boolean;
    functionLabel?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const landingStart = overrides.start ?? 10;
  const previousStart = overrides.previousStart ?? 0;
  const roleId = overrides.roleId ?? "lead-vocal";
  const companionRoleId = roleId === "bass-guitar" ? "keys-right" : "bass-guitar";
  const companionRole = structuredClone(verse.roles.find((role) => role.id === companionRoleId)!);
  delete companionRole.pickupPlan;
  delete companionRole.pickupPlanSource;

  const current = structuredClone(verse);
  current.id = overrides.id ?? "verse-pickup";
  current.label = overrides.label ?? "verse";
  current.groove = "Straight eighths with a late snare feel";
  current.timeRange = { start: landingStart, end: overrides.end ?? landingStart + 20 };
  current.roles = [
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
      pickupPlan: overrides.pickupPlan ?? DEMO_PICKUP_PLAN,
      manualOverrides: []
    },
    companionRole
  ];
  current.partGraph = [
    {
      role_id: roleId,
      is_active: overrides.isActive ?? true,
      handoff_to: [],
      handoff_from: []
    },
    {
      role_id: companionRole.id,
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];

  const previous = structuredClone(current);
  previous.id = `${current.id}-rest`;
  previous.label = "intro";
  previous.timeRange = { start: previousStart, end: landingStart };
  previous.roles = previous.roles.map((role) => {
    const clone = { ...role };
    delete clone.pickupPlan;
    delete clone.pickupPlanSource;
    return clone;
  });
  previous.partGraph = previous.partGraph.map((node) => ({
    ...node,
    is_active: node.role_id === roleId ? (overrides.wasActive ?? false) : true
  }));

  song.sections = [previous, current];
  return song;
}

describe("resolveFirstPickupPlan", () => {
  it("picks the earliest pickup plan and the part that leads into the downbeat", () => {
    const resolved = resolveFirstPickupPlan(withPickupSection());
    expect(resolved?.section.id).toBe("verse-pickup");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.pickupPlan).toBe(DEMO_PICKUP_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatPickupPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatPickupPlanTime(Number.NaN)).toBe("0:00");
    expect(formatPickupPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a pickup plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, hit plans, cutoff plans, turnaround plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withPickupSection();
    delete song.sections[1]!.roles[0]!.pickupPlan;
    song.sections[1]!.groove = "Straight eighths with a late snare feel";
    song.sections[1]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[1]!.roles[0]!.setupNote = DEMO_PICKUP_PLAN;
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
    song.sections[1]!.roles[0]!.cue = { kind: "lyric", value: "city lights" };
    song.sections[1]!.roles[0]!.range = { lowestNote: "G#3", highestNote: "C#5" };
    song.sections[1]!.roles[0]!.overlapWarnings = ["Melodic overlap: competing with Keyboard 1 Right Hand."];
    song.sections[1]!.roles[0]!.harmony = {
      chord: "C#m7",
      functionLabel: "vi melodic pull",
      source: "user"
    };
    song.sections[1]!.roles[0]!.harmonicExplanation = "The ninth is the reason this lift works.";
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
      notes: DEMO_PICKUP_PLAN
    };
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("skips a blank pickup plan", () => {
    expect(resolveFirstPickupPlan(withPickupSection({ pickupPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line pickup plan", () => {
    expect(
      resolveFirstPickupPlan(withPickupSection({ pickupPlan: "Keep the melody centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("prefers the earlier of two pickup plans", () => {
    const song = withPickupSection({
      id: "verse-late-pickup",
      start: 40,
      end: 56,
      previousStart: 24,
      roleId: "keys-right",
      pickupPlan: "Late pickup."
    });
    const earlier = structuredClone(song.sections[1]!);
    const earlierCompanion = structuredClone(earlier.roles[1]!);
    delete earlierCompanion.pickupPlan;
    delete earlierCompanion.pickupPlanSource;
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        pickupPlan: "Earlier pickup."
      },
      earlierCompanion
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: earlierCompanion.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const earlierRest = structuredClone(earlier);
    earlierRest.id = "intro-before-early";
    earlierRest.label = "intro";
    earlierRest.timeRange = { start: 0, end: 8 };
    earlierRest.roles = earlierRest.roles.map((role) => {
      const clone = { ...role };
      delete clone.pickupPlan;
      delete clone.pickupPlanSource;
      return clone;
    });
    earlierRest.partGraph = earlier.partGraph.map((node) => ({
      ...node,
      is_active: node.role_id !== "lead-vocal"
    }));
    song.sections = [earlierRest, earlier, song.sections[0]!, song.sections[1]!];

    const resolved = resolveFirstPickupPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.pickupPlan).toBe("Earlier pickup.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time pickup-plan ties with locale-independent id ordering", () => {
    const song = withPickupSection({ id: "ä-pickup", start: 10, end: 26 });
    const umlautRest = song.sections[0]!;
    const umlaut = song.sections[1]!;
    const asciiRest = structuredClone(umlautRest);
    asciiRest.id = "z-pickup-rest";
    const ascii = structuredClone(umlaut);
    ascii.id = "z-pickup";
    song.sections = [umlautRest, umlaut, asciiRest, ascii];

    expect(resolveFirstPickupPlan(song)?.section.id).toBe("z-pickup");
  });

  it("prefers a high-priority pickup part over a low-priority part in the same section", () => {
    const song = withPickupSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      pickupPlan: "Low-priority pickup."
    });
    const section = song.sections[1]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      pickupPlan: "High-priority pickup."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const previous = song.sections[0]!;
    previous.roles = section.roles.map((role) => {
      const clone = { ...role };
      delete clone.pickupPlan;
      delete clone.pickupPlanSource;
      return clone;
    });
    previous.partGraph = section.partGraph.map((node) => ({ ...node, is_active: false }));

    expect(resolveFirstPickupPlan(song)?.landingRole.id).toBe("lead-vocal");
    expect(resolveFirstPickupPlan(song)?.pickupPlan).toBe("High-priority pickup.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withPickupSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[1]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      pickupPlan: "ASCII pickup."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    const previous = song.sections[0]!;
    previous.roles = section.roles.map((role) => {
      const clone = { ...role };
      delete clone.pickupPlan;
      delete clone.pickupPlanSource;
      return clone;
    });
    previous.partGraph = section.partGraph.map((node) => ({ ...node, is_active: false }));

    expect(resolveFirstPickupPlan(song)?.landingRole.id).toBe("z-role");
    expect(resolveFirstPickupPlan(song)?.pickupPlan).toBe("ASCII pickup.");
  });

  it("skips a pickup plan whose graph node is inactive", () => {
    expect(resolveFirstPickupPlan(withPickupSection({ isActive: false }))).toBeNull();
  });

  it("skips a pickup plan whose previous graph node was already active", () => {
    expect(resolveFirstPickupPlan(withPickupSection({ wasActive: true }))).toBeNull();
  });

  it("skips a pickup plan whose rest and landing windows do not abut", () => {
    const song = withPickupSection({ start: 12 });
    song.sections[0]!.timeRange = { start: 0, end: 10 };
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("skips a pickup plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstPickupPlan(withPickupSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a pickup plan whose end precedes its start", () => {
    expect(resolveFirstPickupPlan(withPickupSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length pickup-plan window", () => {
    expect(resolveFirstPickupPlan(withPickupSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a pickup plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstPickupPlan(
        withPickupSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstPickupPlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a landing part", () => {
    const song = withPickupSection();
    song.sections[1]!.roles = [
      null as never,
      song.sections[1]!.roles[0]!,
      song.sections[1]!.roles[1]!
    ];
    song.sections[1]!.partGraph = [
      null as never,
      song.sections[1]!.partGraph[0]!,
      song.sections[1]!.partGraph[1]!
    ];
    expect(resolveFirstPickupPlan(song)?.landingRole.id).toBe("lead-vocal");
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withPickupSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("keeps the pickup plan unnamed when role identities are duplicated", () => {
    const song = withPickupSection();
    const role = song.sections[1]!.roles[0]!;
    song.sections[1]!.roles = [role, { ...role }];
    song.sections[1]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstPickupPlan(song)).toBeNull();
  });

  it("bounds the pickup plan to 180 Unicode code points", () => {
    const song = withPickupSection({ pickupPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstPickupPlan(song);
    expect(resolved?.pickupPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the pickup-plan boundary", () => {
    const song = withPickupSection({ pickupPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstPickupPlan(song);
    expect(Array.from(resolved?.pickupPlan ?? "")).toHaveLength(180);
    expect(resolved?.pickupPlan.endsWith("😀")).toBe(true);
  });

  it("keeps the generated activity sentence recognizable after bounding a long partner name", () => {
    const target = `Lead-${"A".repeat(180)}`;
    const song = withPickupSection({
      pickupPlan: `Play this pickup with ${target}; land the downbeat together.`
    });
    song.sections[1]!.roles[0]!.pickupPlanSource = "model";
    const resolved = resolveFirstPickupPlan(song);
    expect(resolved?.pickupPlan.startsWith("Play this pickup with Lead-")).toBe(true);
    expect(resolved?.pickupPlan.endsWith("; land the downbeat together.")).toBe(true);
    expect(Array.from(resolved?.pickupPlan ?? "").length).toBeLessThanOrEqual(180);
  });

  it("preserves a short generated shared-pickup sentence", () => {
    const song = withPickupSection({
      pickupPlan: "Play this pickup with Lead Vocal; land the downbeat together."
    });
    expect(resolveFirstPickupPlan(song)?.pickupPlan).toBe(
      "Play this pickup with Lead Vocal; land the downbeat together."
    );
  });

  it("does not treat an empty generated partner as structured guidance", () => {
    const song = withPickupSection({
      pickupPlan: "Play this pickup with ; land the downbeat together."
    });
    expect(resolveFirstPickupPlan(song)?.pickupPlan).toBe(
      "Play this pickup with ; land the downbeat together."
    );
  });

  it("contains exceptions from the runtime root instead of crashing", () => {
    const song = new Proxy(withPickupSection(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor");
      }
    });
    expect(() => resolveFirstPickupPlan(song as never)).not.toThrow();
    expect(resolveFirstPickupPlan(song as never)).toBeNull();
  });
});