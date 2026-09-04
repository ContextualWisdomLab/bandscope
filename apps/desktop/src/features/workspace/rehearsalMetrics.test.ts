import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import {
  formatMetricCopy,
  resolveTonightStartingChord,
  resolveTonightTempo,
  resolveTonightTransposePlan
} from "./rehearsalMetrics";

describe("formatMetricCopy", () => {
  it("interpolates known placeholders once and leaves unknown tokens intact", () => {
    expect(
      formatMetricCopy("Count {bpm} in as {role} in {chord}. {plan} {missing}", {
        bpm: "120",
        role: "Bass Guitar",
        chord: "C#m7",
        plan: "Drop a whole step."
      })
    ).toBe("Count 120 in as Bass Guitar in C#m7. Drop a whole step. {missing}");
    expect(formatMetricCopy("Count {bpm} in {chord}", {})).toBe("Count {bpm} in {chord}");
  });
});

describe("resolveTonightTempo", () => {
  it("returns null when no song is loaded", () => {
    expect(resolveTonightTempo(null)).toBeNull();
    expect(resolveTonightTempo(undefined)).toBeNull();
  });

  it("returns the demo song countable BPM", () => {
    expect(resolveTonightTempo(createDemoRehearsalSong())).toEqual({ bpm: 120 });
  });

  it("rejects non-integer, non-positive, and out-of-range BPM values", () => {
    const song = createDemoRehearsalSong();
    song.tempo = 120.5;
    expect(resolveTonightTempo(song)).toBeNull();
    song.tempo = 0;
    expect(resolveTonightTempo(song)).toBeNull();
    song.tempo = -12;
    expect(resolveTonightTempo(song)).toBeNull();
    song.tempo = 401;
    expect(resolveTonightTempo(song)).toBeNull();
    song.tempo = Number.NaN;
    expect(resolveTonightTempo(song)).toBeNull();
    song.tempo = Number.POSITIVE_INFINITY;
    expect(resolveTonightTempo(song)).toBeNull();
  });

  it("rejects a string tempo masquerading as a number", () => {
    const song = createDemoRehearsalSong();
    (song as unknown as { tempo: unknown }).tempo = "120";
    expect(resolveTonightTempo(song)).toBeNull();
  });
});

describe("resolveTonightStartingChord", () => {
  it("names the first-entrance chord from the highest-priority active part", () => {
    expect(resolveTonightStartingChord(createDemoRehearsalSong())).toEqual({
      chord: "C#m7",
      roleName: "Bass Guitar"
    });
  });

  it("prefers a user harmony override on the selected part", () => {
    const song = createDemoRehearsalSong();
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
    expect(resolveTonightStartingChord(song)).toEqual({
      chord: "C#m11",
      roleName: "Bass Guitar"
    });
  });

  it("does not invent a chord from a later section when the first entrance has none", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    verse.roles = verse.roles.map((role) => ({
      ...role,
      harmony: { ...role.harmony, chord: "   " },
      manualOverrides: []
    }));
    const chorus = structuredClone(verse);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 30, end: 46 };
    chorus.roles = [
      {
        ...verse.roles[0]!,
        harmony: { chord: "Emaj7", functionLabel: "I color", source: "model" }
      }
    ];
    song.sections = [verse, chorus];
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("returns null for a non-object song root", () => {
    expect(resolveTonightStartingChord(null)).toBeNull();
  });

  it("returns null when the runtime section collection is sparse", () => {
    const song = createDemoRehearsalSong();
    const sparseSections: typeof song.sections = new Array(1);
    sparseSections[0] = song.sections[0]!;
    // make it sparse by deleting index 0 after allocating length 2
    const holes: typeof song.sections = new Array(2);
    holes[1] = song.sections[0]!;
    song.sections = holes;
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("keeps the first entrance unlabeled when role identities are duplicated", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    song.sections[0]!.roles = [role, { ...role }];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("skips a first section whose rehearsal window is unbounded", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = { start: Number.NaN, end: 30 };
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("skips a first section whose endpoint overflows the shared timing bound", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = {
      start: MAX_SECTION_TIME_SECONDS,
      end: MAX_SECTION_TIME_SECONDS + 1
    };
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("skips inactive parts and non-harmony overrides before using the owned model chord", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    verse.roles[0] = {
      ...verse.roles[0]!,
      manualOverrides: [
        {
          field: "harmony",
          value: {
            chord: "ignored-inactive",
            functionLabel: "vi",
            source: "user"
          },
          source: "user"
        }
      ]
    };
    verse.partGraph[0] = { ...verse.partGraph[0]!, is_active: false };
    verse.roles[1] = {
      ...verse.roles[1]!,
      manualOverrides: [
        { field: "harmony", value: { chord: "Emaj9", functionLabel: "I", source: "user" }, source: "model" } as never,
        { field: "harmony", source: "user", value: "not-an-object" } as never,
        {
          field: "harmony",
          source: "user",
          value: { chord: "   ", functionLabel: "I", source: "user" }
        }
      ],
      harmony: { chord: "Emaj7", functionLabel: "Imaj7 color", source: "model" }
    };
    expect(resolveTonightStartingChord(song)).toEqual({
      chord: "Emaj7",
      roleName: "Keyboard 1 Right Hand"
    });
  });

  it("prefers the earlier of two labeled first-entrance windows", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const intro = structuredClone(verse);
    intro.id = "intro-1";
    intro.label = "intro";
    intro.timeRange = { start: 0, end: 8 };
    intro.roles = [
      {
        ...verse.roles[0]!,
        harmony: { chord: "B5", functionLabel: "v pedal", source: "model" },
        manualOverrides: []
      }
    ];
    intro.partGraph = [{ role_id: verse.roles[0]!.id, is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [verse, intro];
    expect(resolveTonightStartingChord(song)).toEqual({
      chord: "B5",
      roleName: "Bass Guitar"
    });
  });

  it("skips a zero-length first-entrance window", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = { start: 10, end: 10 };
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("returns null when the first entrance has no dense role graph", () => {
    const song = createDemoRehearsalSong();
    delete (song.sections[0] as { roles?: unknown }).roles;
    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("falls through a non-harmony override and a missing harmony record", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    verse.roles = [
      {
        ...verse.roles[0]!,
        manualOverrides: [{ field: "not-harmony", source: "user", value: { chord: "X", functionLabel: "x", source: "user" } } as never],
        harmony: undefined as never
      }
    ];
    verse.partGraph = [{ role_id: verse.roles[0]!.id, is_active: true, handoff_to: [], handoff_from: [] }];
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("keeps equal first-entrance windows ordered when their ids match", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const clone = structuredClone(verse);
    clone.roles = [
      {
        ...verse.roles[0]!,
        harmony: { chord: "F#m7", functionLabel: "ii", source: "model" },
        manualOverrides: []
      }
    ];
    clone.partGraph = [{ role_id: verse.roles[0]!.id, is_active: true, handoff_to: [], handoff_from: [] }];
    song.sections = [verse, clone];
    expect(resolveTonightStartingChord(song)?.chord).toBe("C#m7");
  });

  it("rejects a present non-array section collection", () => {
    const song = createDemoRehearsalSong();
    (song as unknown as { sections: unknown }).sections = { 0: song.sections[0] };
    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("rejects section collections whose length is not a dense runtime bound", () => {
    const song = createDemoRehearsalSong();
    const withLength = (length: number) =>
      new Proxy([] as typeof song.sections, {
        get(target, prop, receiver) {
          if (prop === "length") {
            return length;
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    (song as { sections: typeof song.sections }).sections = withLength(Number.NaN);
    expect(resolveTonightStartingChord(song)).toBeNull();
    (song as { sections: typeof song.sections }).sections = withLength(-1);
    expect(resolveTonightStartingChord(song)).toBeNull();
    (song as { sections: typeof song.sections }).sections = withLength(0x100000000);
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("skips a first section that does not own a rehearsal window", () => {
    const song = createDemoRehearsalSong();
    delete (song.sections[0] as { timeRange?: unknown }).timeRange;
    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("skips a first section whose window is missing an owned endpoint", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = { start: 0 } as typeof song.sections[0]["timeRange"];
    expect(resolveTonightStartingChord(song)).toBeNull();
    song.sections[0]!.timeRange = { end: 16 } as typeof song.sections[0]["timeRange"];
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("rejects owned timing fields that are present but empty", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = { start: undefined as never, end: 16 };
    expect(resolveTonightStartingChord(song)).toBeNull();
    song.sections[0]!.timeRange = { start: 0, end: undefined as never };
    expect(resolveTonightTransposePlan(song)).toBeNull();
    song.sections[0]!.timeRange = { start: null as never, end: 16 };
    expect(resolveTonightStartingChord(song)).toBeNull();
    song.sections[0]!.timeRange = { start: 0, end: null as never };
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("falls through missing or non-dense manual override collections to the owned model chord", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    const role = verse.roles[0]!;
    delete (role as { manualOverrides?: unknown }).manualOverrides;
    verse.roles = [role];
    verse.partGraph = [{ role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }];
    expect(resolveTonightStartingChord(song)).toEqual({
      chord: "C#m7",
      roleName: "Bass Guitar"
    });
    (role as { manualOverrides?: unknown }).manualOverrides = { 0: { field: "harmony", source: "user", value: { chord: "X" } } };
    expect(resolveTonightStartingChord(song)?.chord).toBe("C#m7");
    const sparse: typeof role.manualOverrides = new Array(1);
    (role as { manualOverrides: typeof role.manualOverrides }).manualOverrides = sparse;
    expect(resolveTonightStartingChord(song)?.chord).toBe("C#m7");
  });

  it("returns null when the first entrance owns a non-array part graph", () => {
    const song = createDemoRehearsalSong();
    delete (song.sections[0] as { partGraph?: unknown }).partGraph;
    expect(resolveTonightStartingChord(song)).toBeNull();
    (song.sections[0] as { partGraph?: unknown }).partGraph = { 0: { role_id: "bass-guitar", is_active: true } };
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });
});

describe("resolveTonightTransposePlan", () => {
  it("names the first-entrance setup from the highest-priority part that has a plan", () => {
    const resolved = resolveTonightTransposePlan(createDemoRehearsalSong());
    expect(resolved?.roleName).toBe("Bass Guitar");
    expect(resolved?.plan).toContain("whole step lower");
  });

  it("does not substitute simplification copy for a missing transpose plan", () => {
    const song = createDemoRehearsalSong();
    for (const role of song.sections[0]!.roles) {
      delete role.transpositionPlan;
    }
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("rejects a multiline or oversized plan instead of rendering a payload", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0]!.transpositionPlan = "first line\nsecret path";
    song.sections[0]!.roles[1]!.transpositionPlan = "x".repeat(181);
    song.sections[0]!.roles[2]!.transpositionPlan = "   ";
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("breaks equal-priority role ties with locale-independent id ordering", () => {
    const song = createDemoRehearsalSong();
    const verse = song.sections[0]!;
    verse.roles = [
      {
        ...verse.roles[0]!,
        id: "ä-role",
        name: "Umlaut role",
        rehearsalPriority: "high",
        transpositionPlan: "Move the umlaut part down."
      },
      {
        ...verse.roles[0]!,
        id: "z-role",
        name: "ASCII role",
        rehearsalPriority: "high",
        transpositionPlan: "Move the ASCII part down."
      }
    ];
    verse.partGraph = [
      { role_id: "ä-role", is_active: true, handoff_to: [], handoff_from: [] },
      { role_id: "z-role", is_active: true, handoff_to: [], handoff_from: [] }
    ];
    expect(resolveTonightTransposePlan(song)).toEqual({
      plan: "Move the ASCII part down.",
      roleName: "ASCII role"
    });
  });
});
