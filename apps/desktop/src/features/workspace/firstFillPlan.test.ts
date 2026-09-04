import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatFillPlanTime, resolveFirstFillPlan } from "./firstFillPlan";

const DEMO_FILL_PLAN =
  "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";

function withFillSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    fillPlan?: string;
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
  section.id = overrides.id ?? "verse-fill";
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
      fillPlan:
        overrides.fillPlan ??
        "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.",
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

describe("resolveFirstFillPlan", () => {
  it("picks the demo song's earliest high-priority fill plan and the part that owns it", () => {
    const resolved = resolveFirstFillPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.fillPlan).toBe(DEMO_FILL_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatFillPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatFillPlanTime(Number.NaN)).toBe("0:00");
    expect(formatFillPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a fill plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, tuning plans, dynamics plans, articulation plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withFillSection();
    delete song.sections[0]!.roles[0]!.fillPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote =
      "Walk eight notes into the chorus downbeat; leave the vocal pickup empty.";
    song.sections[0]!.roles[0]!.transpositionPlan =
      "If the singer drops to B minor, keep the shape a whole step lower.";
    (song.sections[0]!.roles[0] as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
    (song.sections[0]!.roles[0] as { dynamicsPlan?: string }).dynamicsPlan =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
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
      notes: "Walk eight notes into the chorus downbeat; leave the vocal pickup empty."
    };
    expect(resolveFirstFillPlan(song)).toBeNull();
  });

  it("skips a blank fill plan", () => {
    expect(resolveFirstFillPlan(withFillSection({ fillPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line fill plan", () => {
    expect(
      resolveFirstFillPlan(withFillSection({ fillPlan: "Drop under the vocal.\nKeep the pickup." }))
    ).toBeNull();
  });

  it("skips Unicode line separators and accepts BOM-padded fill text", () => {
    for (const fillPlan of ["Fill\u0085here", "Fill\u2028here", "Fill\u2029here"]) {
      expect(resolveFirstFillPlan(withFillSection({ fillPlan }))).toBeNull();
    }
    expect(resolveFirstFillPlan(withFillSection({ fillPlan: "\uFEFF Fill here \uFEFF" }))?.fillPlan).toBe(
      "Fill here"
    );
  });

  it("prefers the earlier of two fill plans", () => {
    const song = withFillSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      fillPlan: "Late fill."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        fillPlan: "Earlier fill."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstFillPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.fillPlan).toBe("Earlier fill.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time fill-plan ties with locale-independent id ordering", () => {
    const song = withFillSection({ id: "ä-fill", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-fill";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstFillPlan(song)?.section.id).toBe("z-fill");
  });

  it("prefers a high-priority fill part over a low-priority part in the same section", () => {
    const song = withFillSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      fillPlan: "Low-priority fill."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      fillPlan: "High-priority fill."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstFillPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstFillPlan(song)?.fillPlan).toBe("High-priority fill.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withFillSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      fillPlan: "ASCII fill."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstFillPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstFillPlan(song)?.fillPlan).toBe("ASCII fill.");
  });

  it("skips a fill plan whose graph node is inactive", () => {
    expect(resolveFirstFillPlan(withFillSection({ isActive: false }))).toBeNull();
  });

  it("skips a fill plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstFillPlan(withFillSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a fill plan whose end precedes its start", () => {
    expect(resolveFirstFillPlan(withFillSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length fill-plan window", () => {
    expect(resolveFirstFillPlan(withFillSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a fill plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstFillPlan(
        withFillSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstFillPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withFillSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstFillPlan(song)).toBeNull();
  });

  it("keeps the fill plan unnamed when role identities are duplicated", () => {
    const song = withFillSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstFillPlan(song)).toBeNull();
  });

  it("bounds the fill plan to 180 Unicode code points", () => {
    const song = withFillSection({ fillPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstFillPlan(song);
    expect(resolved?.fillPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the fill-plan boundary", () => {
    const song = withFillSection({ fillPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstFillPlan(song);
    expect(Array.from(resolved?.fillPlan ?? "")).toHaveLength(180);
    expect(resolved?.fillPlan.endsWith("😀")).toBe(true);
  });
});
