import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { formatConfirmedHarmonyTime, resolveFirstConfirmedHarmony } from "./firstConfirmedHarmony";

function withConfirmedSection(
  overrides: {
    id?: string;
    start?: number;
    end?: number;
    chord?: string;
    functionLabel?: string;
    label?: "intro" | "verse" | "pre-chorus" | "chorus" | "bridge" | "outro" | "tag" | "pickup" | "stop" | "handoff";
    roleId?: string;
    roleName?: string;
    priority?: "low" | "medium" | "high";
    isActive?: boolean;
    modelChord?: string;
  } = {}
) {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const section = structuredClone(verse);
  section.id = overrides.id ?? "verse-confirmed";
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
        chord: overrides.modelChord ?? "C#m7",
        functionLabel: "vi melodic pull",
        source: "model"
      },
      confidence: {
        level: "high",
        source: "user",
        notes: "Singer confirmed the pickup phrasing in rehearsal notes."
      },
      manualOverrides: [
        {
          field: "harmony",
          value: {
            chord: overrides.chord ?? "C#m11",
            functionLabel: overrides.functionLabel ?? "vi suspended lift",
            source: "user"
          },
          source: "user"
        }
      ]
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

describe("resolveFirstConfirmedHarmony", () => {
  it("picks the demo song's earliest confirmed chord and the part that owns it", () => {
    const resolved = resolveFirstConfirmedHarmony(createDemoRehearsalSong());
    expect(resolved?.section.id).toBe("verse-1");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.chord).toBe("C#m11");
    expect(resolved?.atSeconds).toBe(10);
    expect(resolved?.hint).toBe("vi suspended lift");
    expect(formatConfirmedHarmonyTime(resolved?.atSeconds ?? -1)).toBe("0:10");
    expect(formatConfirmedHarmonyTime(Number.NaN)).toBe("0:00");
    expect(formatConfirmedHarmonyTime(-4)).toBe("0:00");
  });

  it("does not invent a confirmed chord from model harmony, groove, cue, setup, simplification, overlap, range, or confidence", () => {
    const song = withConfirmedSection();
    song.sections[0]!.roles[0]!.manualOverrides = [];
    song.sections[0]!.groove = "Straight eighths with a late snare feel";
    song.sections[0]!.roles[0]!.setupNote = "Watch the breath before the last line of the verse.";
    song.sections[0]!.roles[0]!.simplification = "Keep the sustained note centered.";
    song.sections[0]!.roles[0]!.cue = { kind: "lyric", value: "city lights" };
    song.sections[0]!.roles[0]!.range = { lowestNote: "G#3", highestNote: "C#5" };
    song.sections[0]!.roles[0]!.overlapWarnings = ["Melodic overlap: competing with Keyboard 1 Right Hand."];
    song.sections[0]!.roles[0]!.harmony = {
      chord: "C#m7",
      functionLabel: "vi melodic pull",
      source: "user"
    };
    song.sections[0]!.roles[0]!.confidence = {
      level: "high",
      source: "user",
      notes: "Ready to trust the part."
    };
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("still names a confirmed chord when the function label is empty", () => {
    const resolved = resolveFirstConfirmedHarmony(withConfirmedSection({ functionLabel: "   " }));
    expect(resolved?.section.id).toBe("verse-confirmed");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.chord).toBe("C#m11");
    expect(resolved?.hint).toBe("");
  });

  it("prefers the earlier of two confirmed chords", () => {
    const song = withConfirmedSection({ id: "verse-late", start: 40, end: 56, roleId: "keys-right", chord: "Emaj9" });
    const earlier = structuredClone(song.sections[0]!);
    earlier.id = "verse-early";
    earlier.roles = [
      {
        ...earlier.roles[0]!,
        id: "lead-vocal",
        name: "Lead Vocal",
        rehearsalPriority: "low",
        manualOverrides: [
          {
            field: "harmony",
            value: {
              chord: "C#m11",
              functionLabel: "vi suspended lift",
              source: "user"
            },
            source: "user"
          }
        ]
      }
    ];
    earlier.timeRange = { start: 8, end: 24 };
    earlier.partGraph = [{ role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [song.sections[0]!, earlier];

    const resolved = resolveFirstConfirmedHarmony(song);
    expect(resolved?.section.id).toBe("verse-early");
    expect(resolved?.holdingRole.id).toBe("lead-vocal");
    expect(resolved?.chord).toBe("C#m11");
    expect(resolved?.atSeconds).toBe(8);
  });

  it("breaks same-time confirmed-harmony ties with locale-independent id ordering", () => {
    const song = withConfirmedSection({ id: "ä-confirmed", start: 10, end: 26 });
    const ascii = structuredClone(song.sections[0]!);
    ascii.id = "z-confirmed";
    song.sections = [song.sections[0]!, ascii];

    expect(resolveFirstConfirmedHarmony(song)?.section.id).toBe("z-confirmed");
  });

  it("prefers a high-priority confirmed part over a low-priority part in the same section", () => {
    const song = withConfirmedSection({ roleId: "keys-right", roleName: "Keys", priority: "low", chord: "Emaj9" });
    const section = song.sections[0]!;
    const highRole = {
      ...section.roles[0]!,
      id: "lead-vocal",
      name: "Lead Vocal",
      rehearsalPriority: "high" as const,
      manualOverrides: [
        {
          field: "harmony" as const,
          value: {
            chord: "C#m11",
            functionLabel: "vi suspended lift",
            source: "user" as const
          },
          source: "user" as const
        }
      ]
    };
    section.roles = [section.roles[0]!, highRole];
    section.partGraph = [
      { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstConfirmedHarmony(song)?.holdingRole.id).toBe("lead-vocal");
    expect(resolveFirstConfirmedHarmony(song)?.chord).toBe("C#m11");
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = withConfirmedSection({ roleId: "ä-role", roleName: "Umlaut role", priority: "high" });
    const section = song.sections[0]!;
    const asciiRole = {
      ...section.roles[0]!,
      id: "z-role",
      name: "ASCII role",
      manualOverrides: [
        {
          field: "harmony" as const,
          value: {
            chord: "Gmaj7",
            functionLabel: "ASCII confirmed chord",
            source: "user" as const
          },
          source: "user" as const
        }
      ]
    };
    section.roles = [section.roles[0]!, asciiRole];
    section.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];

    expect(resolveFirstConfirmedHarmony(song)?.holdingRole.id).toBe("z-role");
    expect(resolveFirstConfirmedHarmony(song)?.chord).toBe("Gmaj7");
  });

  it("skips a confirmed chord whose graph node is inactive", () => {
    expect(resolveFirstConfirmedHarmony(withConfirmedSection({ isActive: false }))).toBeNull();
  });

  it("skips a confirmed chord whose rehearsal window is unbounded", () => {
    expect(resolveFirstConfirmedHarmony(withConfirmedSection({ start: Number.NaN, end: 30 }))).toBeNull();
  });

  it("skips a confirmed chord whose end precedes its start", () => {
    expect(resolveFirstConfirmedHarmony(withConfirmedSection({ start: 30, end: 10 }))).toBeNull();
  });

  it("skips a zero-length confirmed-harmony window", () => {
    expect(resolveFirstConfirmedHarmony(withConfirmedSection({ start: 10, end: 10 }))).toBeNull();
  });

  it("skips a confirmed chord whose endpoint overflows the shared timing bound", () => {
    expect(
      resolveFirstConfirmedHarmony(
        withConfirmedSection({
          start: MAX_SECTION_TIME_SECONDS,
          end: MAX_SECTION_TIME_SECONDS + 1
        })
      )
    ).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveFirstConfirmedHarmony(null as never)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = withConfirmedSection();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[0]!;
    song.sections = sparseSections;
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("keeps the confirmed chord unnamed when role identities are duplicated", () => {
    const song = withConfirmedSection();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveFirstConfirmedHarmony(song)).toBeNull();
  });

  it("skips a blank confirmed chord", () => {
    expect(resolveFirstConfirmedHarmony(withConfirmedSection({ chord: "   " }))).toBeNull();
  });

  it("bounds the confirmed chord to 32 Unicode code points", () => {
    const song = withConfirmedSection({ chord: `${"G".repeat(40)}` });
    const resolved = resolveFirstConfirmedHarmony(song);
    expect(resolved?.chord.length).toBe(32);
  });

  it("does not split a Unicode surrogate pair at the hint boundary", () => {
    const song = withConfirmedSection({ functionLabel: `${"a".repeat(179)}😀tail` });
    const resolved = resolveFirstConfirmedHarmony(song);
    expect(Array.from(resolved?.hint ?? "")).toHaveLength(180);
    expect(resolved?.hint.endsWith("😀")).toBe(true);
  });
});
