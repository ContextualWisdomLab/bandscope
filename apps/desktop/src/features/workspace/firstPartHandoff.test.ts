import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { formatPartHandoffTime, resolveFirstPartHandoff } from "./firstPartHandoff";

type SectionLabel = "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";

type TransitionOverrides = {
  id?: string;
  start?: number;
  end?: number;
  label?: SectionLabel;
  givingId?: string;
  givingName?: string;
  receivingId?: string;
  receivingName?: string;
  givingPriority?: "low" | "medium" | "high";
  receivingPriority?: "low" | "medium" | "high";
  givingActive?: boolean;
  receivingActive?: boolean;
  givingDestinationActive?: boolean;
  handoffTo?: string[];
  handoffFrom?: string[];
};

function withHandoffTransition(overrides: TransitionOverrides = {}): RehearsalSong {
  const song = createDemoRehearsalSong();
  const template = song.sections[0]!;
  const givingTemplate = template.roles[0]!;
  const receivingTemplate = template.roles[2]!;
  const givingId = overrides.givingId ?? "bass-guitar";
  const receivingId = overrides.receivingId ?? "lead-vocal";
  const givingRole = {
    ...givingTemplate,
    id: givingId,
    name: overrides.givingName ?? "Bass Guitar",
    rehearsalPriority: overrides.givingPriority ?? "high" as const
  };
  const receivingRole = {
    ...receivingTemplate,
    id: receivingId,
    name: overrides.receivingName ?? "Lead Vocal",
    rehearsalPriority: overrides.receivingPriority ?? "medium" as const
  };
  const source = {
    ...structuredClone(template),
    id: "source-section",
    label: "verse" as const,
    timeRange: { start: 0, end: 10 },
    roles: [givingRole],
    partGraph: [
      {
        role_id: givingId,
        is_active: overrides.givingActive ?? true,
        handoff_to: overrides.handoffTo ?? [receivingId],
        handoff_from: []
      },
      {
        role_id: receivingId,
        is_active: false,
        handoff_to: [],
        handoff_from: overrides.handoffFrom ?? [givingId]
      }
    ]
  };
  const destination = {
    ...structuredClone(template),
    id: overrides.id ?? "destination-section",
    label: overrides.label ?? "chorus",
    timeRange: { start: overrides.start ?? 10, end: overrides.end ?? 30 },
    roles: [receivingRole],
    partGraph: [
      {
        role_id: givingId,
        is_active: overrides.givingDestinationActive ?? false,
        handoff_to: [],
        handoff_from: []
      },
      {
        role_id: receivingId,
        is_active: overrides.receivingActive ?? true,
        handoff_to: [],
        handoff_from: []
      }
    ]
  };
  return { ...song, sections: [source, destination] };
}

function transitionPair(overrides: TransitionOverrides = {}) {
  const song = withHandoffTransition(overrides);
  return [structuredClone(song.sections[0]!), structuredClone(song.sections[1]!)] as const;
}

describe("resolveFirstPartHandoff", () => {
  it("treats the shipped one-section demo graph as non-transition evidence", () => {
    expect(resolveFirstPartHandoff(createDemoRehearsalSong())).toBeNull();
    expect(formatPartHandoffTime(Number.NaN)).toBe("0:00");
    expect(formatPartHandoffTime(-4)).toBe("0:00");
  });

  it("names the destination of the earliest corroborated activity transition", () => {
    const resolved = resolveFirstPartHandoff(withHandoffTransition());
    expect(resolved?.section.id).toBe("destination-section");
    expect(resolved?.givingRole.id).toBe("bass-guitar");
    expect(resolved?.receivingRole.id).toBe("lead-vocal");
    expect(resolved?.givingName).toBe("Bass Guitar");
    expect(resolved?.receivingName).toBe("Lead Vocal");
    expect(resolved?.atSeconds).toBe(10);
    expect(formatPartHandoffTime(resolved?.atSeconds ?? -1)).toBe("0:10");
  });

  it("does not invent a pass from buyer-visible descriptive metadata", () => {
    const song = withHandoffTransition({ label: "handoff", handoffTo: [], handoffFrom: [] });
    const source = song.sections[0]!;
    source.groove = "Straight eighths with a late snare feel";
    source.roles[0]!.simplification = "Stay on roots.";
    source.roles[0]!.setupNote = "Keep the attack short.";
    source.roles[0]!.cue = { kind: "transition", value: "Hold through the pickup." };
    source.roles[0]!.range = { lowestNote: "C#2", highestNote: "E3" };
    source.roles[0]!.overlapWarnings = ["Density warning."];
    source.roles[0]!.harmony = { chord: "C#m7", functionLabel: "vi pedal anchor", source: "user" };
    source.roles[0]!.harmonicExplanation = "The bass holds the vi center.";
    source.roles[0]!.transpositionPlan = "Drop a whole step.";
    source.roles[0]!.confidence = {
      level: "high",
      source: "user",
      notes: "Bass Guitar hands off to Lead Vocal."
    };
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("requires source-side receiving-edge corroboration", () => {
    expect(resolveFirstPartHandoff(withHandoffTransition({ handoffFrom: [] }))).toBeNull();
  });

  it("skips self-handoffs", () => {
    expect(
      resolveFirstPartHandoff(
        withHandoffTransition({
          receivingId: "bass-guitar",
          handoffTo: ["bass-guitar"],
          handoffFrom: ["bass-guitar"]
        })
      )
    ).toBeNull();
  });

  it("requires the giver to deactivate and receiver to activate in the destination", () => {
    expect(resolveFirstPartHandoff(withHandoffTransition({ receivingActive: false }))).toBeNull();
    expect(resolveFirstPartHandoff(withHandoffTransition({ givingDestinationActive: true }))).toBeNull();
  });

  it("requires the giving graph node to be active in the source", () => {
    expect(resolveFirstPartHandoff(withHandoffTransition({ givingActive: false }))).toBeNull();
  });

  it("prefers the earlier destination when multiple transitions are valid", () => {
    const late = transitionPair({ id: "late", start: 40, end: 56, givingId: "keys-right", givingName: "Keys" });
    const early = transitionPair({ id: "early", start: 8, end: 24, givingPriority: "low" });
    const song = withHandoffTransition();
    song.sections = [...late, ...early];

    const resolved = resolveFirstPartHandoff(song);
    expect(resolved?.section.id).toBe("early");
    expect(resolved?.givingRole.id).toBe("bass-guitar");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time destination ties with locale-independent section id ordering", () => {
    const umlaut = transitionPair({ id: "ä-handoff", start: 10, end: 26 });
    const ascii = transitionPair({ id: "z-handoff", start: 10, end: 26 });
    const song = withHandoffTransition();
    song.sections = [...umlaut, ...ascii];

    expect(resolveFirstPartHandoff(song)?.section.id).toBe("z-handoff");
  });

  it("prefers higher-priority giving roles within one source transition", () => {
    const song = withHandoffTransition({ givingId: "keys-right", givingName: "Keys", givingPriority: "low" });
    const source = song.sections[0]!;
    const destination = song.sections[1]!;
    const highRole = { ...source.roles[0]!, id: "bass-guitar", name: "Bass Guitar", rehearsalPriority: "high" as const };
    source.roles = [source.roles[0]!, highRole];
    source.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: ["keys-right", "bass-guitar"] }
    ];
    destination.partGraph = [
      { role_id: "keys-right", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "bass-guitar", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstPartHandoff(song)?.givingRole.id).toBe("bass-guitar");
  });

  it("breaks equal-priority giving-role ties with locale-independent ids", () => {
    const song = withHandoffTransition({ givingId: "ä-role", givingName: "Umlaut role", givingPriority: "high" });
    const source = song.sections[0]!;
    const destination = song.sections[1]!;
    const asciiRole = { ...source.roles[0]!, id: "z-role", name: "ASCII role" };
    source.roles = [source.roles[0]!, asciiRole];
    source.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: ["ä-role", "z-role"] }
    ];
    destination.partGraph = [
      { role_id: "ä-role", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstPartHandoff(song)?.givingRole.id).toBe("z-role");
  });

  it("fails closed on invalid destination timing", () => {
    expect(resolveFirstPartHandoff(withHandoffTransition({ start: Number.NaN, end: 30 }))).toBeNull();
    expect(resolveFirstPartHandoff(withHandoffTransition({ start: 30, end: 10 }))).toBeNull();
    expect(resolveFirstPartHandoff(withHandoffTransition({ start: 10, end: 10 }))).toBeNull();
    expect(
      resolveFirstPartHandoff(
        withHandoffTransition({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for malformed roots and sparse section collections", () => {
    expect(resolveFirstPartHandoff(null as never)).toBeNull();
    const song = withHandoffTransition();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("keeps a handoff unnamed when source role or graph identities are duplicated", () => {
    const song = withHandoffTransition();
    const source = song.sections[0]!;
    const role = source.roles[0]!;
    source.roles = [role, { ...role }];
    source.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: [role.id] }
    ];
    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("bounds displayed role names by Unicode code points", () => {
    const longName = resolveFirstPartHandoff(withHandoffTransition({ givingName: "G".repeat(200) }));
    expect(longName?.givingName.length).toBe(80);

    const emojiName = resolveFirstPartHandoff(withHandoffTransition({ givingName: `${"a".repeat(79)}😀tail` }));
    expect(Array.from(emojiName?.givingName ?? "")).toHaveLength(80);
    expect(emojiName?.givingName.endsWith("😀")).toBe(true);
  });
});
