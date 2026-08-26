import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatTurnaroundPlanTime, resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

const DEMO_TURNAROUND_PLAN =
  "Turn these last bars with Lead Vocal on the verse last beat; land the chorus downbeat together.";

function withTurnaroundSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    turnaroundPlan?: string;
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
  section.id = overrides.id ?? "verse-turnaround";
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
      turnaroundPlan: overrides.turnaroundPlan ?? DEMO_TURNAROUND_PLAN,
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

describe("resolveFirstTurnaroundPlan", () => {
  it("picks the demo song's earliest turnaround plan and the part that carries it into the next section", () => {
    const resolved = resolveFirstTurnaroundPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.landingRole.id).toBe("bass-guitar");
    expect(resolved?.turnaroundPlan).toBe(DEMO_TURNAROUND_PLAN);
    expect(resolved?.atSeconds).toBe(30);
    expect(formatTurnaroundPlanTime(resolved?.atSeconds ?? -1)).toBe("0:30");
    expect(formatTurnaroundPlanTime(Number.NaN)).toBe("0:00");
    expect(formatTurnaroundPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a turnaround plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, hit plans, cutoff plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withTurnaroundSection();
    delete song.sections[0]!.roles[0]!.turnaroundPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = DEMO_TURNAROUND_PLAN;
    song.sections[0]!.roles[0]!.transpositionPlan =
      "If the singer drops to B minor, keep the shape a whole step lower.";
    (song.sections[0]!.roles[0] as { vampPlan?: string }).vampPlan =
      "Keep this part going until Lead Vocal enters in the next section.";
    (song.sections[0]!.roles[0] as { fillPlan?: string }).fillPlan =
      "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";
    (song.sections[0]!.roles[0] as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
    (song.sections[0]!.roles[0] as { dynamicsPlan?: string }).dynamicsPlan =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
    (song.sections[0]!.roles[0] as { articulationPlan?: string }).articulationPlan =
      "Shorten the last chorus vowel so the band can hear the turnaround.";
    (song.sections[0]!.roles[0] as { hookPlan?: string }).hookPlan =
      "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";
    (song.sections[0]!.roles[0] as { soloPlan?: string }).soloPlan =
      "Hold the verse solo; everyone else drops to a two-bar pad so the run can land.";
    (song.sections[0]!.roles[0] as { padPlan?: string }).padPlan =
      "Drop to a two-bar pad so the Keyboard 1 Right Hand run can land.";
    (song.sections[0]!.roles[0] as { hitPlan?: string }).hitPlan =
      "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.";
    (song.sections[0]!.roles[0] as { cutoffPlan?: string }).cutoffPlan =
      "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup.";
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
      notes: DEMO_TURNAROUND_PLAN
    };
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("skips a blank turnaround plan", () => {
    expect(resolveFirstTurnaroundPlan(withTurnaroundSection({ turnaroundPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line turnaround plan", () => {
    expect(
      resolveFirstTurnaroundPlan(withTurnaroundSection({ turnaroundPlan: "Keep the melody centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("prefers the earlier of two turnaround plans", () => {
    const song = withTurnaroundSection({
      id: "verse-late-turnaround",
      start: 40,
      end: 56,
      roleId: "keys-right",
      turnaroundPlan: "Late turnaround."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        turnaroundPlan: "Earlier turnaround."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstTurnaroundPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.turnaroundPlan).toBe("Earlier turnaround.");
    expect(resolved?.atSeconds).toBe(24);
  });

  it("breaks same-time turnaround-plan ties with locale-independent id ordering", () => {
    const song = withTurnaroundSection({ id: "ä-turnaround", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-turnaround";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstTurnaroundPlan(song)?.section.id).toBe("z-turnaround");
  });

  it("prefers a high-priority turnaround part over a low-priority part in the same section", () => {
    const song = withTurnaroundSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      turnaroundPlan: "Low-priority turnaround."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      turnaroundPlan: "High-priority turnaround."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTurnaroundPlan(song)?.landingRole.id).toBe("lead-vocal");
    expect(resolveFirstTurnaroundPlan(song)?.turnaroundPlan).toBe("High-priority turnaround.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withTurnaroundSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      turnaroundPlan: "ASCII turnaround."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstTurnaroundPlan(song)?.landingRole.id).toBe("z-role");
    expect(resolveFirstTurnaroundPlan(song)?.turnaroundPlan).toBe("ASCII turnaround.");
  });

  it("skips a turnaround plan whose graph node is inactive", () => {
    expect(resolveFirstTurnaroundPlan(withTurnaroundSection({ isActive: false }))).toBeNull();
  });

  it("skips a turnaround plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstTurnaroundPlan(withTurnaroundSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a turnaround plan whose end precedes its start", () => {
    expect(resolveFirstTurnaroundPlan(withTurnaroundSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length turnaround-plan window", () => {
    expect(resolveFirstTurnaroundPlan(withTurnaroundSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a turnaround plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstTurnaroundPlan(
        withTurnaroundSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstTurnaroundPlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a landing part", () => {
    const song = withTurnaroundSection();
    song.sections[0]!.roles = [null as never, song.sections[0]!.roles[0]!];
    song.sections[0]!.partGraph = [null as never, song.sections[0]!.partGraph[0]!];
    expect(resolveFirstTurnaroundPlan(song)?.landingRole.id).toBe("lead-vocal");
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withTurnaroundSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("keeps the turnaround plan unnamed when role identities are duplicated", () => {
    const song = withTurnaroundSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstTurnaroundPlan(song)).toBeNull();
  });

  it("bounds the turnaround plan to 180 Unicode code points", () => {
    const song = withTurnaroundSection({ turnaroundPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstTurnaroundPlan(song);
    expect(resolved?.turnaroundPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the turnaround-plan boundary", () => {
    const song = withTurnaroundSection({ turnaroundPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstTurnaroundPlan(song);
    expect(Array.from(resolved?.turnaroundPlan ?? "")).toHaveLength(180);
    expect(resolved?.turnaroundPlan.endsWith("😀")).toBe(true);
  });

  it("keeps the generated activity sentence recognizable after bounding a long partner name", () => {
    const target = `Lead-${"A".repeat(180)}`;
    const song = withTurnaroundSection({
      turnaroundPlan: `Turn these last bars with ${target}; land the downbeat together.`
    });
    const resolved = resolveFirstTurnaroundPlan(song);
    expect(resolved?.turnaroundPlan.startsWith("Turn these last bars with Lead-")).toBe(true);
    expect(resolved?.turnaroundPlan.endsWith("; land the downbeat together.")).toBe(true);
    expect(Array.from(resolved?.turnaroundPlan ?? "").length).toBeLessThanOrEqual(180);
  });

  it("preserves a short generated shared-turnaround sentence", () => {
    const song = withTurnaroundSection({
      turnaroundPlan: "Turn these last bars with Lead Vocal; land the downbeat together."
    });
    expect(resolveFirstTurnaroundPlan(song)?.turnaroundPlan).toBe(
      "Turn these last bars with Lead Vocal; land the downbeat together."
    );
  });

  it("does not treat an empty generated partner as structured guidance", () => {
    const song = withTurnaroundSection({
      turnaroundPlan: "Turn these last bars with ; land the downbeat together."
    });
    expect(resolveFirstTurnaroundPlan(song)?.turnaroundPlan).toBe(
      "Turn these last bars with ; land the downbeat together."
    );
  });

  it("contains exceptions from the runtime root instead of crashing", () => {
    const song = new Proxy(withTurnaroundSection(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor");
      }
    });
    expect(() => resolveFirstTurnaroundPlan(song as never)).not.toThrow();
    expect(resolveFirstTurnaroundPlan(song as never)).toBeNull();
  });
});
