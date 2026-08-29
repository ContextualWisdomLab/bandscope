import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatDynamicsPlanTime, resolveFirstDynamicsPlan } from "./firstDynamicsPlan";

const DEMO_DYNAMICS_PLAN =
  "Keep the verse under the vocal so the chorus still has somewhere to lift.";

function withDynamicsSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    dynamicsPlan?: string;
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
  section.id = overrides.id ?? "verse-dynamics";
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
      dynamicsPlan:
        overrides.dynamicsPlan ??
        "Keep the verse under the vocal so the chorus still has somewhere to lift.",
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

describe("resolveFirstDynamicsPlan", () => {
  it("picks the demo song's earliest high-priority dynamics plan and the part that owns it", () => {
    const resolved = resolveFirstDynamicsPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("bass-guitar");
    expect(resolved?.dynamicsPlan).toBe(DEMO_DYNAMICS_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatDynamicsPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatDynamicsPlanTime(Number.NaN)).toBe("0:00");
    expect(formatDynamicsPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a dynamics plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withDynamicsSection();
    delete song.sections[0]!.roles[0]!.dynamicsPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote =
      "Keep the verse under the vocal so the chorus still has somewhere to lift.";
    song.sections[0]!.roles[0]!.transpositionPlan =
      "If the singer drops to B minor, keep the shape a whole step lower.";
    (song.sections[0]!.roles[0] as { tuningPlan?: string }).tuningPlan =
      "Tune the E string down to D so the verse riff sits on the open fifth.";
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
      notes: "Keep the verse under the vocal so the chorus still has somewhere to lift."
    };
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("skips a blank dynamics plan", () => {
    expect(resolveFirstDynamicsPlan(withDynamicsSection({ dynamicsPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line dynamics plan", () => {
    expect(
      resolveFirstDynamicsPlan(withDynamicsSection({ dynamicsPlan: "Drop under the vocal.\nKeep the pickup." }))
    ).toBeNull();
  });

  it("skips Unicode line separators and accepts BOM-padded dynamics text", () => {
    for (const dynamicsPlan of ["Hold\u0085here", "Hold\u2028here", "Hold\u2029here"]) {
      expect(resolveFirstDynamicsPlan(withDynamicsSection({ dynamicsPlan }))).toBeNull();
    }
    expect(resolveFirstDynamicsPlan(withDynamicsSection({ dynamicsPlan: "\uFEFF Hold here \uFEFF" }))?.dynamicsPlan).toBe(
      "Hold here"
    );
  });

  it("prefers the earlier of two dynamics plans", () => {
    const song = withDynamicsSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      dynamicsPlan: "Late dynamics."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        dynamicsPlan: "Earlier dynamics."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstDynamicsPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.dynamicsPlan).toBe("Earlier dynamics.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time dynamics-plan ties with locale-independent id ordering", () => {
    const song = withDynamicsSection({ id: "ä-dynamics", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-dynamics";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstDynamicsPlan(song)?.section.id).toBe("z-dynamics");
  });

  it("prefers a high-priority dynamics part over a low-priority part in the same section", () => {
    const song = withDynamicsSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      dynamicsPlan: "Low-priority dynamics."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      dynamicsPlan: "High-priority dynamics."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstDynamicsPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstDynamicsPlan(song)?.dynamicsPlan).toBe("High-priority dynamics.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withDynamicsSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      dynamicsPlan: "ASCII dynamics."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstDynamicsPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstDynamicsPlan(song)?.dynamicsPlan).toBe("ASCII dynamics.");
  });

  it("skips a dynamics plan whose graph node is inactive", () => {
    expect(resolveFirstDynamicsPlan(withDynamicsSection({ isActive: false }))).toBeNull();
  });

  it("skips a dynamics plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstDynamicsPlan(withDynamicsSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a dynamics plan whose end precedes its start", () => {
    expect(resolveFirstDynamicsPlan(withDynamicsSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length dynamics-plan window", () => {
    expect(resolveFirstDynamicsPlan(withDynamicsSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a dynamics plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstDynamicsPlan(
        withDynamicsSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstDynamicsPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withDynamicsSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("keeps the dynamics plan unnamed when role identities are duplicated", () => {
    const song = withDynamicsSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstDynamicsPlan(song)).toBeNull();
  });

  it("bounds the dynamics plan to 180 Unicode code points", () => {
    const song = withDynamicsSection({ dynamicsPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstDynamicsPlan(song);
    expect(resolved?.dynamicsPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the dynamics-plan boundary", () => {
    const song = withDynamicsSection({ dynamicsPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstDynamicsPlan(song);
    expect(Array.from(resolved?.dynamicsPlan ?? "")).toHaveLength(180);
    expect(resolved?.dynamicsPlan.endsWith("😀")).toBe(true);
  });
});
