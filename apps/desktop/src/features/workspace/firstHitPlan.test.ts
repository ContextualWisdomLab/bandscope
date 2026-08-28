import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatHitPlanTime, resolveFirstHitPlan } from "./firstHitPlan";

const DEMO_HIT_PLAN =
  "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.";

function withHitSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    hitPlan?: string;
    label?: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    hitPlanSource?: "model" | "user";
    isActive?: boolean;
    functionLabel?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-hit";
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
      hitPlan: overrides.hitPlan ?? DEMO_HIT_PLAN,
      hitPlanSource: overrides.hitPlanSource ?? "model",
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

describe("resolveFirstHitPlan", () => {
  it("picks the demo song's earliest hit plan and the part that lands it", () => {
    const resolved = resolveFirstHitPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.landingRole.id).toBe("bass-guitar");
    expect(resolved?.hitPlan).toBe(DEMO_HIT_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatHitPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatHitPlanTime(Number.NaN)).toBe("0:00");
    expect(formatHitPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a hit plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withHitSection();
    delete song.sections[0]!.roles[0]!.hitPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = DEMO_HIT_PLAN;
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
      "Shorten the last chorus vowel so the band can hear the cutoff.";
    (song.sections[0]!.roles[0] as { hookPlan?: string }).hookPlan =
      "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";
    (song.sections[0]!.roles[0] as { soloPlan?: string }).soloPlan =
      "Hold the verse solo; everyone else drops to a two-bar pad so the run can land.";
    (song.sections[0]!.roles[0] as { padPlan?: string }).padPlan =
      "Drop to a two-bar pad so the Keyboard 1 Right Hand run can land.";
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
      notes: DEMO_HIT_PLAN
    };
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("skips a blank hit plan", () => {
    expect(resolveFirstHitPlan(withHitSection({ hitPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line hit plan", () => {
    expect(
      resolveFirstHitPlan(withHitSection({ hitPlan: "Keep the melody centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("skips a hit plan without explicit provenance", () => {
    const song = withHitSection();
    delete song.sections[0]!.roles[0]!.hitPlanSource;

    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("prefers the earlier of two hit plans", () => {
    const song = withHitSection({
      id: "verse-late-hit",
      start: 40,
      end: 56,
      roleId: "keys-right",
      hitPlan: "Late hit.",
      hitPlanSource: "user"
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        hitPlan: "Earlier hit.",
        hitPlanSource: "user"
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.hitPlan).toBe("Earlier hit.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time hit-plan ties with locale-independent id ordering", () => {
    const song = withHitSection({ id: "ä-hit", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-hit";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstHitPlan(song)?.section.id).toBe("z-hit");
  });

  it("prefers a high-priority hit part over a low-priority part in the same section", () => {
    const song = withHitSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      hitPlan: "Low-priority hit.",
      hitPlanSource: "user"
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      hitPlan: "High-priority hit.",
      hitPlanSource: "user" as const
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHitPlan(song)?.landingRole.id).toBe("lead-vocal");
    expect(resolveFirstHitPlan(song)?.hitPlan).toBe("High-priority hit.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withHitSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      hitPlan: "ASCII hit.",
      hitPlanSource: "user"
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHitPlan(song)?.landingRole.id).toBe("z-role");
    expect(resolveFirstHitPlan(song)?.hitPlan).toBe("ASCII hit.");
  });

  it("skips a hit plan whose graph node is inactive", () => {
    expect(resolveFirstHitPlan(withHitSection({ isActive: false }))).toBeNull();
  });

  it("skips a hit plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstHitPlan(withHitSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a hit plan whose end precedes its start", () => {
    expect(resolveFirstHitPlan(withHitSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length hit-plan window", () => {
    expect(resolveFirstHitPlan(withHitSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a hit plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstHitPlan(
        withHitSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstHitPlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a landing part", () => {
    const song = withHitSection();
    song.sections[0]!.roles = [null as never, song.sections[0]!.roles[0]!];
    song.sections[0]!.partGraph = [null as never, song.sections[0]!.partGraph[0]!];
    expect(resolveFirstHitPlan(song)?.landingRole.id).toBe("lead-vocal");
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withHitSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("keeps the hit plan unnamed when role identities are duplicated", () => {
    const song = withHitSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstHitPlan(song)).toBeNull();
  });

  it("bounds the hit plan to 180 Unicode code points", () => {
    const song = withHitSection({ hitPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.hitPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hit-plan boundary", () => {
    const song = withHitSection({ hitPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstHitPlan(song);
    expect(Array.from(resolved?.hitPlan ?? "")).toHaveLength(180);
    expect(resolved?.hitPlan.endsWith("😀")).toBe(true);
  });

  it("keeps the generated activity sentence recognizable after bounding a long partner name", () => {
    const target = `Lead-${"A".repeat(180)}`;
    const song = withHitSection({
      hitPlan: `Land this hit with ${target}; don't drift past the downbeat.`
    });
    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.hitPlan.startsWith("Land this hit with Lead-")).toBe(true);
    expect(resolved?.hitPlan.endsWith("; don't drift past the downbeat.")).toBe(true);
    expect(Array.from(resolved?.hitPlan ?? "").length).toBeLessThanOrEqual(180);
  });

  it("preserves a short generated shared-hit sentence", () => {
    const song = withHitSection({
      hitPlan: "Land this hit with Lead Vocal; don't drift past the downbeat."
    });
    expect(resolveFirstHitPlan(song)?.hitPlan).toBe(
      "Land this hit with Lead Vocal; don't drift past the downbeat."
    );
  });

  it("does not treat an empty generated partner as structured guidance", () => {
    const song = withHitSection({
      hitPlan: "Land this hit with ; don't drift past the downbeat."
    });
    expect(resolveFirstHitPlan(song)?.hitPlan).toBe(
      "Land this hit with ; don't drift past the downbeat."
    );
  });

  it("contains exceptions from the runtime root instead of crashing", () => {
    const song = new Proxy(withHitSection(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor");
      }
    });
    expect(() => resolveFirstHitPlan(song as never)).not.toThrow();
    expect(resolveFirstHitPlan(song as never)).toBeNull();
  });
});
