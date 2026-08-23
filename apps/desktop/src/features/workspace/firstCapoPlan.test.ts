import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatCapoPlanTime, resolveFirstCapoPlan } from "./firstCapoPlan";

const DEMO_CAPO_PLAN =
  "Capo 2 in standard tuning so the verse fingers G shapes while the room still sounds in A.";

function withCapoSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    capoPlan?: string;
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
  section.id = overrides.id ?? "verse-transpose";
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
      capoPlan:
        overrides.capoPlan ??
        "Capo 2 in standard tuning so the verse fingers G shapes while the room still sounds in A.",
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

describe("resolveFirstCapoPlan", () => {
  it("picks the demo song's earliest high-priority capo plan and the part that owns it", () => {
    const resolved = resolveFirstCapoPlan(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("acoustic-guitar");
    expect(resolved?.capoPlan).toBe(DEMO_CAPO_PLAN);
    expect(resolved?.atSeconds).toBe(10);
    expect(formatCapoPlanTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatCapoPlanTime(Number.NaN)).toBe("0:00");
    expect(formatCapoPlanTime(-4)).toBe("0:00");
  });

  it("does not invent a capo plan from groove, cue, simplification, overlap, range, chords, function labels, setup notes, transposition plans, confirmed overrides, harmonic explanations, or confidence notes", () => {
    const song = withCapoSection();
    delete song.sections[0]!.roles[0]!.capoPlan;
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.setupNote = "Setup: Standard tuning, Capo 2";
    song.sections[0]!.roles[0]!.transpositionPlan = "If the singer drops to B minor, keep the shape a whole step lower.";
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
      notes: "Capo 2 in standard tuning so the verse fingers G shapes."
    };
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("skips a blank capo plan", () => {
    expect(resolveFirstCapoPlan(withCapoSection({ capoPlan: "   " }))).toBeNull();
  });

  it("skips a multi-line capo plan", () => {
    expect(
      resolveFirstCapoPlan(withCapoSection({ capoPlan: "Drop a step.\nKeep the pickup." }))
    ).toBeNull();
  });

  it("prefers the earlier of two capo plans", () => {
    const song = withCapoSection({
      id: "verse-late",
      start: 40,
      end: 56,
      roleId: "keys-right",
      capoPlan: "Late guitar capo."
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        capoPlan: "Earlier guitar capo."
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstCapoPlan(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.capoPlan).toBe("Earlier guitar capo.");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time capo-plan ties with locale-independent id ordering", () => {
    const song = withCapoSection({ id: "ä-transpose", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-transpose";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstCapoPlan(song)?.section.id).toBe("z-transpose");
  });

  it("prefers a high-priority capo part over a low-priority part in the same section", () => {
    const song = withCapoSection({
      roleId: "keys-right",
      roleName: "Keys",
      priority: "low",
      capoPlan: "Low-priority guitar capo."
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      capoPlan: "High-priority guitar capo."
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstCapoPlan(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstCapoPlan(song)?.capoPlan).toBe("High-priority guitar capo.");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withCapoSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      capoPlan: "ASCII guitar capo."
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstCapoPlan(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstCapoPlan(song)?.capoPlan).toBe("ASCII guitar capo.");
  });

  it("skips a capo plan whose graph node is inactive", () => {
    expect(resolveFirstCapoPlan(withCapoSection({ isActive: false }))).toBeNull();
  });

  it("skips a capo plan whose rehearsal window is unbounded", () => {
    expect(resolveFirstCapoPlan(withCapoSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a capo plan whose end precedes its start", () => {
    expect(resolveFirstCapoPlan(withCapoSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length capo-plan window", () => {
    expect(resolveFirstCapoPlan(withCapoSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a capo plan whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstCapoPlan(
        withCapoSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstCapoPlan(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withCapoSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("keeps the capo plan unnamed when role identities are duplicated", () => {
    const song = withCapoSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstCapoPlan(song)).toBeNull();
  });

  it("bounds the capo plan to 180 Unicode code points", () => {
    const song = withCapoSection({ capoPlan: `${"G".repeat(200)}` });
    const resolved = resolveFirstCapoPlan(song);
    expect(resolved?.capoPlan.length).toBe(180);
  });

  it("does not split a Unicode surrogate pair at the capo-plan boundary", () => {
    const song = withCapoSection({ capoPlan: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstCapoPlan(song);
    expect(Array.from(resolved?.capoPlan ?? "")).toHaveLength(180);
    expect(resolved?.capoPlan.endsWith("😀")).toBe(true);
  });
});
