import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatPartHandoffTime, resolveFirstPartHandoff } from "./firstPartHandoff";

function withHandoffSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    label?: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";
    givingId?: string;
    givingName?: string;
    receivingId?: string;
    receivingName?: string;
    givingPriority?: "low" | "medium" | "high";
    receivingPriority?: "low" | "medium" | "high";
    givingActive?: boolean;
    receivingActive?: boolean;
    handoffTo?: string[];
    handoffFrom?: string[];
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-handoff";
  section.label = overrides.label ?? "verse";
  section.groove = "Straight eighths with a late snare feel";
  section.timeRange = { start: overrides.start ?? 10, end: overrides.end ?? 30 };
  const givingId = overrides.givingId ?? "bass-guitar";
  const receivingId = overrides.receivingId ?? "lead-vocal";
  section.roles = [
    {
      ...verse.roles[0]!,
      id: givingId,
      name: overrides.givingName ?? "Bass Guitar",
      rehearsalPriority: overrides.givingPriority ?? "high",
      cue: { kind: "transition", value: "Hold through the pickup before the downbeat." },
      range: { lowestNote: "C#2", highestNote: "E3" },
      setupNote: "Keep the attack short so the verse breathes.",
      simplification: "Stay on roots if the chorus entrance gets muddy.",
      overlapWarnings: ["Density warning: competing with Keyboard Left Hand in low register."],
      harmony: { chord: "C#m7", functionLabel: "vi pedal anchor", source: "model" },
      harmonicExplanation: "The bass holds the vi center.",
      confidence: { level: "medium", source: "model", notes: "Watch the slide into the turnaround." },
      transpositionPlan: "If the singer drops to B minor, keep the shape a whole step lower.",
      manualOverrides: []
    },
    {
      ...verse.roles[2]!,
      id: receivingId,
      name: overrides.receivingName ?? "Lead Vocal",
      rehearsalPriority: overrides.receivingPriority ?? "medium",
      cue: { kind: "lyric", value: "city lights" },
      range: { lowestNote: "G#3", highestNote: "C#5" },
      setupNote: "Watch the breath before the last line of the verse.",
      simplification: "Keep the sustained note centered.",
      overlapWarnings: ["Melodic overlap: competing with Keyboard 1 Right Hand."],
      harmony: { chord: "C#m7", functionLabel: "vi melodic pull", source: "model" },
      harmonicExplanation: "The melody leans on the ninth over vi.",
      confidence: { level: "high", source: "user", notes: "Singer confirmed the pickup phrasing." },
      transpositionPlan: "Move the section down a whole step.",
      manualOverrides: []
    }
  ];
  section.partGraph = [
    {
      role_id: givingId,
      is_active: overrides.givingActive ?? true,
      handoff_to: overrides.handoffTo ?? [receivingId],
      handoff_from: []
    },
    {
      role_id: receivingId,
      is_active: overrides.receivingActive ?? true,
      handoff_to: [],
      handoff_from: overrides.handoffFrom ?? [givingId]
    }
  ];
  song.sections = [section];
  return song;
}

describe("resolveFirstPartHandoff", () => {
  it("picks the demo song's earliest corroborated part handoff", () => {
    const resolved = resolveFirstPartHandoff(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.givingRole.id).toBe("bass-guitar");
    expect(resolved?.receivingRole.id).toBe("lead-vocal");
    expect(resolved?.givingName).toBe("Bass Guitar");
    expect(resolved?.receivingName).toBe("Lead Vocal");
    expect(resolved?.atSeconds).toBe(10);
    expect(formatPartHandoffTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatPartHandoffTime(Number.NaN)).toBe("0:00");
    expect(formatPartHandoffTime(-4)).toBe("0:00");
  });

  it("does not invent a part handoff from groove, cue, simplification, overlap, range, chords, function labels, setup notes, confirmed overrides, harmonic explanations, confidence notes, transposition plans, or a labeled handoff section", () => {
    const song = withHandoffSection({ label: "handoff" });
    song.sections[0]!.partGraph[0]!.handoff_to = [];
    song.sections[0]!.partGraph[1]!.handoff_from = [];
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.simplification = "Stay on roots.";
    song.sections[0]!.roles[0]!.setupNote = "Keep the attack short.";
    song.sections[0]!.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup." };
    song.sections[0]!.roles[0]!.range = { lowestNote: "C#2", highestNote: "E3" };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Density warning."];
    song.sections[0]!.roles[0]!.harmony = { chord: "C#m7", functionLabel: "vi pedal anchor", source: "user" };
    song.sections[0]!.roles[0]!.harmonicExplanation = "The bass holds the vi center.";
    song.sections[0]!.roles[0]!.transpositionPlan = "Drop a whole step.";
    song.sections[0]!.roles[0]!.confidence = {
      level: "high",
      source: "user",
      notes: "Bass Guitar hands off to Lead Vocal."
    };
    song.sections[0]!.roles[0]!.manualOverrides = [
      {
        field: "harmony",
        value: { chord: "C#m11", functionLabel: "vi suspended lift", source: "user" },
        source: "user"
      }
    ];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("skips a one-sided outgoing pass that the receiving part does not corroborate", () => {
    expect(resolveFirstPartHandoff(withHandoffSection({ handoffFrom: [] }))).toBeNull();
  });

  it("skips a self-handoff", () => {
    expect(
      resolveFirstPartHandoff(withHandoffSection({ handoffTo: ["bass-guitar"], handoffFrom: ["bass-guitar"] }))
    ).toBeNull();
  });

  it("prefers the earlier of two corroborated handoffs", () => {
    const song = withHandoffSection({
      id: "verse-late",
      start: 40,
      end: 56,
      givingId: "keys-right",
      givingName: "Keys",
      receivingId: "lead-vocal",
      receivingName: "Lead Vocal"
    });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.timeRange = { start: 8, end: 24 };
    earlier.roles = [
      { ...earlier.roles[0]!, id: "bass-guitar", name: "Bass Guitar", rehearsalPriority: "low" },
      { ...earlier.roles[1]!, id: "lead-vocal", name: "Lead Vocal", rehearsalPriority: "medium" }
    ];
    earlier.partGraph = [
      { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: ["bass-guitar"] }
    ];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstPartHandoff(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.givingRole.id).toBe("bass-guitar");
    expect(resolved?.receivingRole.id).toBe("lead-vocal");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time handoff ties with locale-independent section id ordering", () => {
    const song = withHandoffSection({ id: "ä-handoff", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-handoff";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstPartHandoff(song)?.section.id).toBe("z-handoff");
  });

  it("prefers a high-priority giving part over a low-priority giving part in the same section", () => {
    const song = withHandoffSection({
      givingId: "keys-right",
      givingName: "Keys",
      givingPriority: "low",
      receivingId: "lead-vocal"
    });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "bass-guitar",
      name: "Bass Guitar",
      rehearsalPriority: "high" as const
    };
    section.roles = [section.roles[0]!, highRole, section.roles[1]!];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: ["keys-right", "bass-guitar"] }
    ];

    expect(resolveFirstPartHandoff(song)?.givingRole.id).toBe("bass-guitar");
  });

  it("breaks equal-priority giving-role ties with locale-independent id ordering", () => {
    const song = withHandoffSection({ givingId: "ä-role", givingName: "Umlaut role", givingPriority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role"
    };
    section.roles = [section.roles[0]!, asciiRole, section.roles[1]!];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: ["ä-role", "z-role"] }
    ];

    expect(resolveFirstPartHandoff(song)?.givingRole.id).toBe("z-role");
  });

  it("skips a handoff whose giving graph node is inactive", () => {
    expect(resolveFirstPartHandoff(withHandoffSection({ givingActive: false }))).toBeNull();
  });

  it("skips a handoff whose receiving graph node is inactive", () => {
    expect(resolveFirstPartHandoff(withHandoffSection({ receivingActive: false }))).toBeNull();
  });

  it("skips a handoff whose rehearsal window is unbounded", () => {
    expect(resolveFirstPartHandoff(withHandoffSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a handoff whose end precedes its start", () => {
    expect(resolveFirstPartHandoff(withHandoffSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length handoff window", () => {
    expect(resolveFirstPartHandoff(withHandoffSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a handoff whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstPartHandoff(
        withHandoffSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstPartHandoff(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withHandoffSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("keeps the handoff unnamed when role identities are duplicated", () => {
    const song = withHandoffSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }, song.sections[0]!.roles[1]!];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [role.id] }
    ];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("bounds displayed giving-role names to 80 Unicode code points", () => {
    const song = withHandoffSection({ givingName: "G".repeat(200) });
    const resolved = resolveFirstPartHandoff(song);
    expect(resolved?.givingName.length).toBe(80);
  });

  it("does not split a Unicode surrogate pair at the giving-name boundary", () => {
    const song = withHandoffSection({ givingName: `${"a".repeat(79)}😀tail` });
    const resolved = resolveFirstPartHandoff(song);
    expect(Array.from(resolved?.givingName ?? "")).toHaveLength(80);
    expect(resolved?.givingName.endsWith("😀")).toBe(true);
  });
});
