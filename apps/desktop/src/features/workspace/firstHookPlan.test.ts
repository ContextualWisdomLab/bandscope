import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatHookPlanTime, resolveFirstHookPlan } from "./firstHookPlan";

const DEMO_HOOK_PLAN =
  "Lead vocal carries the chorus hook; lock the melody before anyone stacks harmony.";

function withHookSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    hookPlan?: string;
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
  section.id = overrides.id ?? "verse-hook";
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
      hookPlan:
        overrides.hookPlan ??
        DEMO_HOOK_PLAN,
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

describe("resolveFirstHookPlan", () => {
  it("picks the demo song's earliest hook plan and the part that owns it", () => {
    const resolved = resolveFirstHookPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.hookPlan).toBe(DEMO_HOOK_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatHookPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatHookPlanTime(Number.NaN)).toBe("0:00");
    expect(formatHookPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a hook plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, fill plans, tuning plans, dynamics plans, articulation plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withHookSection();
    delete song.sections[0]!.roles[0]!.hookPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = DEMO_HOOK_PLAN;
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
      notes: DEMO_HOOK_PLAN
    };
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("skips a blank hook plan", () => {
    expect(resolveFirstHookPlan(withHookSection({ hookPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line hook plan", () => {
    expect(
      resolveFirstHookPlan(withHookSection({ hookPlan: "Keep the melody centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("skips Unicode line separators and accepts BOM-padded hook text", () => {
    for (const hookPlan of ["Keep\u0085melody", "Keep\u2028melody", "Keep\u2029melody"]) {
      expect(resolveFirstHookPlan(withHookSection({ hookPlan }))).toBeNull();
    }
    expect(resolveFirstHookPlan(withHookSection({ hookPlan: "\uFEFF Keep melody \uFEFF" }))?.hookPlan).toBe(
      "Keep melody"
    );
  });

  it("prefers the earlier of two hook plans", () => {
    const song = withHookSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      hookPlan: "Late hook."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        hookPlan: "Earlier hook."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstHookPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.hookPlan).toBe("Earlier hook.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time hook-plan ties with locale-independent id ordering", () => {
    const song = withHookSection({ id: "ä-hook", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-hook";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstHookPlan(song)?.section.id).toBe("z-hook");
  });

  it("prefers a high-priority hook part over a low-priority part in the same section", () => {
    const song = withHookSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      hookPlan: "Low-priority hook."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      hookPlan: "High-priority hook."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHookPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstHookPlan(song)?.hookPlan).toBe("High-priority hook.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withHookSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      hookPlan: "ASCII hook."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstHookPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstHookPlan(song)?.hookPlan).toBe("ASCII hook.");
  });

  it("skips a hook plan whose graph node is inactive", () => {
    expect(resolveFirstHookPlan(withHookSection({ isActive: false }))).toBeNull();
  });

  it("skips a hook plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstHookPlan(withHookSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a hook plan whose end precedes its start", () => {
    expect(resolveFirstHookPlan(withHookSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length hook-plan window", () => {
    expect(resolveFirstHookPlan(withHookSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a hook plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstHookPlan(
        withHookSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstHookPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withHookSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("keeps the hook plan unnamed when role identities are duplicated", () => {
    const song = withHookSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstHookPlan(song)).toBeNull();
  });

  it("bounds the hook plan to 180 Unicode code points", () => {
    const song = withHookSection({ hookPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstHookPlan(song);
    expect(resolved?.hookPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the hook-plan boundary", () => {
    const song = withHookSection({ hookPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstHookPlan(song);
    expect(Array.from(resolved?.hookPlan ?? "")).toHaveLength(180);
    expect(resolved?.hookPlan.endsWith("😀")).toBe(true);
  });
});
