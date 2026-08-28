import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatCutoffPlanTime, resolveFirstCutoffPlan } from "./firstCutoffPlan";

const DEMO_CUTOFF_PLAN =
  "Cut this off with Lead Vocal on the verse last beat; don't linger past the pickup.";

function withCutoffSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    cutoffPlan?: string;
    cutoffPlanSource?: "model" | "user";
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
  section.id = overrides.id ?? "verse-cutoff";
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
      cutoffPlan: overrides.cutoffPlan ?? DEMO_CUTOFF_PLAN,
      cutoffPlanSource: overrides.cutoffPlanSource,
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

describe("resolveFirstCutoffPlan", () => {
  it("picks the demo song's earliest cutoff plan and the part that leaves it", () => {
    const resolved = resolveFirstCutoffPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.landingRole.id).toBe("bass-guitar");
    expect(resolved?.cutoffPlan).toBe(DEMO_CUTOFF_PLAN);
    expect(resolved?.atSeconds).toBe(30);
    expect(formatCutoffPlanTime(resolved?.atSeconds ?? -1)).toBe("0:30");
    expect(formatCutoffPlanTime(Number.NaN)).toBe("0:00");
    expect(formatCutoffPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a cutoff plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, vamp plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, hit plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withCutoffSection();
    delete song.sections[0]!.roles[0]!.cutoffPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = DEMO_CUTOFF_PLAN;
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
    (song.sections[0]!.roles[0] as { hitPlan?: string }).hitPlan =
      "Land this hit with Lead Vocal on the verse downbeat; don't drift past the pickup.";
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
      notes: DEMO_CUTOFF_PLAN
    };
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("skips a blank cutoff plan", () => {
    expect(resolveFirstCutoffPlan(withCutoffSection({ cutoffPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line cutoff plan", () => {
    expect(
      resolveFirstCutoffPlan(withCutoffSection({ cutoffPlan: "Keep the melody centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("prefers the earlier of two cutoff plans", () => {
    const song = withCutoffSection({
      id: "verse-late-cutoff",
      start: 40,
      end: 56,
      roleId: "keys-right",
      cutoffPlan: "Late cutoff."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        cutoffPlan: "Earlier cutoff."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstCutoffPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.landingRole.id).toBe("lead-vocal");
    expect(resolved?.cutoffPlan).toBe("Earlier cutoff.");
    expect(resolved?.atSeconds).toBe(24);
  });

  it("breaks same-time cutoff-plan ties with locale-independent id ordering", () => {
    const song = withCutoffSection({ id: "ä-cutoff", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-cutoff";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstCutoffPlan(song)?.section.id).toBe("z-cutoff");
  });

  it("preserves the first section when same-time cutoff plans share an id", () => {
    const first = withCutoffSection({ id: "same-cutoff" });
    const second = structuredClone(first.sections[0]!);
    second.roles[0]!.cutoffPlan = "Second cutoff.";
    first.sections = [first.sections[0]!, second];

    expect(resolveFirstCutoffPlan(first)?.sectionIndex).toBe(0);
    expect(resolveFirstCutoffPlan(first)?.cutoffPlan).toBe(DEMO_CUTOFF_PLAN);
  });

  it("prefers a high-priority cutoff part over a low-priority part in the same section", () => {
    const song = withCutoffSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      cutoffPlan: "Low-priority cutoff."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      cutoffPlan: "High-priority cutoff."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstCutoffPlan(song)?.landingRole.id).toBe("lead-vocal");
    expect(resolveFirstCutoffPlan(song)?.cutoffPlan).toBe("High-priority cutoff.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withCutoffSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      cutoffPlan: "ASCII cutoff."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstCutoffPlan(song)?.landingRole.id).toBe("z-role");
    expect(resolveFirstCutoffPlan(song)?.cutoffPlan).toBe("ASCII cutoff.");
  });

  it("skips a cutoff plan whose graph node is inactive", () => {
    expect(resolveFirstCutoffPlan(withCutoffSection({ isActive: false }))).toBeNull();
  });

  it("skips a cutoff plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstCutoffPlan(withCutoffSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a cutoff plan whose end precedes its start", () => {
    expect(resolveFirstCutoffPlan(withCutoffSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length cutoff-plan window", () => {
    expect(resolveFirstCutoffPlan(withCutoffSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a cutoff plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstCutoffPlan(
        withCutoffSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstCutoffPlan(null as never)).toBeNull();
  });

  it("skips non-object roles and graph nodes without inventing a landing part", () => {
    const song = withCutoffSection();
    song.sections[0]!.roles = [null as never, song.sections[0]!.roles[0]!];
    song.sections[0]!.partGraph = [null as never, song.sections[0]!.partGraph[0]!];
    expect(resolveFirstCutoffPlan(song)?.landingRole.id).toBe("lead-vocal");
  });

  it("skips a role whose owned ranking metadata is invalid", () => {
    const song = withCutoffSection();
    const section = song.sections[0]!;
    section.roles = [{ ...section.roles[0]!, name: "" }];

    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("skips a role whose owned id is not a non-empty string", () => {
    const song = withCutoffSection();
    const section = song.sections[0]!;
    section.roles = [{ ...section.roles[0]!, id: 42 as never }];

    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("skips sections with invalid dense runtime collections", () => {
    const invalidRoles = withCutoffSection();
    invalidRoles.sections[0]!.roles = {} as never;
    expect(resolveFirstCutoffPlan(invalidRoles)).toBeNull();

    const invalidLength = withCutoffSection();
    invalidLength.sections[0]!.roles = new Proxy(invalidLength.sections[0]!.roles, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "length") {
          return {
            configurable: false,
            enumerable: false,
            value: Number.NaN,
            writable: true
          };
        }
        return Object.getOwnPropertyDescriptor(target, property);
      }
    }) as never;
    expect(resolveFirstCutoffPlan(invalidLength)).toBeNull();

    const invalidGraph = withCutoffSection();
    invalidGraph.sections[0]!.partGraph = {} as never;
    expect(resolveFirstCutoffPlan(invalidGraph)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withCutoffSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("keeps the cutoff plan unnamed when role identities are duplicated", () => {
    const song = withCutoffSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstCutoffPlan(song)).toBeNull();
  });

  it("bounds the cutoff plan to 180 Unicode code points", () => {
    const song = withCutoffSection({ cutoffPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstCutoffPlan(song);
    expect(resolved?.cutoffPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the cutoff-plan boundary", () => {
    const song = withCutoffSection({ cutoffPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstCutoffPlan(song);
    expect(Array.from(resolved?.cutoffPlan ?? "")).toHaveLength(180);
    expect(resolved?.cutoffPlan.endsWith("😀")).toBe(true);
  });

  it("keeps the generated activity sentence recognizable after bounding a long partner name", () => {
    const target = `Lead-${"A".repeat(180)}`;
    const song = withCutoffSection({
      cutoffPlan: `Cut this off with ${target}; don't linger past the last beat.`,
      cutoffPlanSource: "model"
    });
    const resolved = resolveFirstCutoffPlan(song);
    expect(resolved?.cutoffPlan.startsWith("Cut this off with Lead-")).toBe(true);
    expect(resolved?.cutoffPlan.endsWith("; don't linger past the last beat.")).toBe(true);
    expect(Array.from(resolved?.cutoffPlan ?? "").length).toBeLessThanOrEqual(180);
  });

  it("preserves a short generated shared-cutoff sentence", () => {
    const song = withCutoffSection({
      cutoffPlan: "Cut this off with Lead Vocal; don't linger past the last beat."
    });
    expect(resolveFirstCutoffPlan(song)?.cutoffPlan).toBe(
      "Cut this off with Lead Vocal; don't linger past the last beat."
    );
  });

  it("does not treat an empty generated partner as structured guidance", () => {
    const song = withCutoffSection({
      cutoffPlan: "Cut this off with ; don't linger past the last beat."
    });
    expect(resolveFirstCutoffPlan(song)?.cutoffPlan).toBe(
      "Cut this off with ; don't linger past the last beat."
    );
  });

  it("falls back to bounded plain text for malformed model guidance", () => {
    const song = withCutoffSection({
      cutoffPlan: "Keep the last beat short.",
      cutoffPlanSource: "model"
    });
    expect(resolveFirstCutoffPlan(song)?.cutoffPlan).toBe("Keep the last beat short.");

    const emptyTarget = withCutoffSection({
      cutoffPlan: "Cut this off with ; don't linger past the last beat.",
      cutoffPlanSource: "model"
    });
    expect(resolveFirstCutoffPlan(emptyTarget)?.cutoffPlan).toBe(
      "Cut this off with ; don't linger past the last beat."
    );
  });

  it("contains exceptions from the runtime root instead of crashing", () => {
    const song = new Proxy(withCutoffSection(), {
      getOwnPropertyDescriptor() {
        throw new Error("hostile descriptor");
      }
    });
    expect(() => resolveFirstCutoffPlan(song as never)).not.toThrow();
    expect(resolveFirstCutoffPlan(song as never)).toBeNull();
  });
});
