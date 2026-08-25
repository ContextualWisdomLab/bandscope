import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatSoloPlanTime, resolveFirstSoloPlan } from "./firstSoloPlan";

const DEMO_SOLO_PLAN =
  "Hold the verse solo; everyone else drops to a two-bar pad so the run can land.";

function withSoloSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    soloPlan?: string;
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
  section.id = overrides.id ?? "verse-solo";
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
      soloPlan:
        overrides.soloPlan ??
        DEMO_SOLO_PLAN,
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

describe("resolveFirstSoloPlan", () => {
  it("picks the demo song's earliest solo plan and the part that owns it", () => {
    const resolved = resolveFirstSoloPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("keys-right");
    expect(resolved?.soloPlan).toBe(DEMO_SOLO_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatSoloPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatSoloPlanTime(Number.NaN)).toBe("0:00");
    expect(formatSoloPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a solo plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, fill plans, tuning plans, dynamics plans, articulation plans, hook plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withSoloSection();
    delete song.sections[0]!.roles[0]!.soloPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = DEMO_SOLO_PLAN;
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
      notes: DEMO_SOLO_PLAN
    };
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("skips a blank solo plan", () => {
    expect(resolveFirstSoloPlan(withSoloSection({ soloPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line solo plan", () => {
    expect(
      resolveFirstSoloPlan(withSoloSection({ soloPlan: "Keep the melody centered.\nLeave the stack." }))
    ).toBeNull();
  });

  it("prefers the earlier of two solo plans", () => {
    const song = withSoloSection({
      id: "verse-late-solo",
      start: 40,
      end: 56,
      roleId: "keys-right",
      soloPlan: "Late solo."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        soloPlan: "Earlier solo."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstSoloPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.soloPlan).toBe("Earlier solo.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time solo-plan ties with locale-independent id ordering", () => {
    const song = withSoloSection({ id: "ä-solo", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-solo";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstSoloPlan(song)?.section.id).toBe("z-solo");
  });

  it("prefers a high-priority solo part over a low-priority part in the same section", () => {
    const song = withSoloSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      soloPlan: "Low-priority solo."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      soloPlan: "High-priority solo."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstSoloPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstSoloPlan(song)?.soloPlan).toBe("High-priority solo.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withSoloSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      soloPlan: "ASCII solo."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstSoloPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstSoloPlan(song)?.soloPlan).toBe("ASCII solo.");
  });

  it("skips a solo plan whose graph node is inactive", () => {
    expect(resolveFirstSoloPlan(withSoloSection({ isActive: false }))).toBeNull();
  });

  it("skips a solo plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstSoloPlan(withSoloSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a solo plan whose end precedes its start", () => {
    expect(resolveFirstSoloPlan(withSoloSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length solo-plan window", () => {
    expect(resolveFirstSoloPlan(withSoloSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a solo plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstSoloPlan(
        withSoloSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstSoloPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withSoloSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("keeps the solo plan unnamed when role identities are duplicated", () => {
    const song = withSoloSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstSoloPlan(song)).toBeNull();
  });

  it("bounds the solo plan to 180 Unicode code points", () => {
    const song = withSoloSection({ soloPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstSoloPlan(song);
    expect(resolved?.soloPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the solo-plan boundary", () => {
    const song = withSoloSection({ soloPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstSoloPlan(song);
    expect(Array.from(resolved?.soloPlan ?? "")).toHaveLength(180);
    expect(resolved?.soloPlan.endsWith("😀")).toBe(true);
  });
});
