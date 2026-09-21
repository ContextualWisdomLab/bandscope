import { describe, expect, it } from "vitest";
import {
  MAX_SECTION_TIME_SECONDS,
  createDemoRehearsalSong,
  type SectionFormLabel
} from "@bandscope/shared-types";
import { formatVampPlanTime, resolveFirstVampPlan } from "./firstVampPlan";

const DEMO_VAMP_PLAN =
  "Hold the two-bar verse groove until the vocal pickup; don't move until you hear city lights.";

function withVampSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    vampPlan?: string;
    vampPlanSource?: "model" | "user";
    label?: SectionFormLabel;
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
  section.id = overrides.id ?? "verse-vamp";
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
      vampPlan:
        overrides.vampPlan ??
        DEMO_VAMP_PLAN,
      vampPlanSource: overrides.vampPlanSource ?? "model",
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

describe("resolveFirstVampPlan", () => {
  it("picks the demo song's earliest vamp plan and the part that owns it", () => {
    const resolved = resolveFirstVampPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.vampPlan).toBe(DEMO_VAMP_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatVampPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatVampPlanTime(Number.NaN)).toBe("0:00");
    expect(formatVampPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a vamp plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, solo plans, pad plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withVampSection();
    delete song.sections[0]!.roles[0]!.vampPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = DEMO_VAMP_PLAN;
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
      notes: DEMO_VAMP_PLAN
    };
    expect(resolveFirstVampPlan(song)).toBeNull();
  });

  it("skips a blank vamp plan", () => {
    expect(resolveFirstVampPlan(withVampSection({ vampPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line vamp plan", () => {
    expect(
      resolveFirstVampPlan(withVampSection({ vampPlan: "Keep the melody centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("skips a vamp plan without explicit provenance", () => {
    const song = withVampSection();
    delete song.sections[0]!.roles[0]!.vampPlanSource;

    expect(resolveFirstVampPlan(song)).toBeNull();
  });

  it("prefers the earlier of two vamp plans", () => {
    const song = withVampSection({
      id: "verse-late-vamp",
      start: 40,
      end: 56,
      roleId: "keys-right",
      vampPlan: "Late vamp.",
      vampPlanSource: "user"
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        vampPlan: "Earlier vamp.",
        vampPlanSource: "user"
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstVampPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.vampPlan).toBe("Earlier vamp.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time vamp-plan ties with locale-independent id ordering", () => {
    const song = withVampSection({ id: "ä-vamp", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-vamp";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstVampPlan(song)?.section.id).toBe("z-vamp");
  });

  it("prefers a high-priority vamp part over a low-priority part in the same section", () => {
    const song = withVampSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      vampPlan: "Low-priority vamp.",
      vampPlanSource: "user"
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      vampPlan: "High-priority vamp.",
      vampPlanSource: "user" as const
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstVampPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstVampPlan(song)?.vampPlan).toBe("High-priority vamp.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withVampSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      vampPlan: "ASCII vamp.",
      vampPlanSource: "user"
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstVampPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstVampPlan(song)?.vampPlan).toBe("ASCII vamp.");
  });

  it("skips a vamp plan whose graph node is inactive", () => {
    expect(resolveFirstVampPlan(withVampSection({ isActive: false }))).toBeNull();
  });

  it("skips a vamp plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstVampPlan(withVampSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a vamp plan whose end precedes its start", () => {
    expect(resolveFirstVampPlan(withVampSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length vamp-plan window", () => {
    expect(resolveFirstVampPlan(withVampSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a vamp plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstVampPlan(
        withVampSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstVampPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withVampSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstVampPlan(song)).toBeNull();
  });

  it("keeps the vamp plan unnamed when role identities are duplicated", () => {
    const song = withVampSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstVampPlan(song)).toBeNull();
  });

  it("bounds the vamp plan to 180 Unicode code points", () => {
    const song = withVampSection({ vampPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstVampPlan(song);
    expect(resolved?.vampPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the vamp-plan boundary", () => {
    const song = withVampSection({ vampPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstVampPlan(song);
    expect(Array.from(resolved?.vampPlan ?? "")).toHaveLength(180);
    expect(resolved?.vampPlan.endsWith("😀")).toBe(true);
  });
});
