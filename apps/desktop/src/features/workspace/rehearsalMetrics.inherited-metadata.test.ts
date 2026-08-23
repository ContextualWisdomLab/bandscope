import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  resolveTonightStartingChord,
  resolveTonightTempo,
  resolveTonightTransposePlan
} from "./rehearsalMetrics";

describe("rehearsal cockpit metrics inherited metadata", () => {
  it("rejects a song whose required metadata is inherited", () => {
    const song = createDemoRehearsalSong();
    const inheritedSong = Object.create({
      tempo: 120,
      sections: song.sections
    }) as typeof song;
    expect(resolveTonightTempo(inheritedSong)).toBeNull();
    expect(resolveTonightStartingChord(inheritedSong)).toBeNull();
    expect(resolveTonightTransposePlan(inheritedSong)).toBeNull();
  });

  it("rejects inherited timing fields", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = Object.create({ start: 10, end: 30 }) as typeof song.sections[0]["timeRange"];
    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("does not let inherited role or graph metadata establish the first-entrance part", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    const node = song.sections[0]!.partGraph[0]!;
    song.sections[0]!.roles = [Object.create(role) as typeof role];
    song.sections[0]!.partGraph = [Object.create(node) as typeof node];
    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("rejects arrays masquerading as section records", () => {
    const song = createDemoRehearsalSong();
    const arraySection = Object.assign([], song.sections[0]!) as unknown as (typeof song.sections)[number];
    song.sections = [arraySection];
    expect(resolveTonightStartingChord(song)).toBeNull();
  });

  it("rejects an inherited chord or transpose plan", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    const harmony = Object.create({ chord: "C#m7" }) as typeof role.harmony;
    song.sections[0]!.roles = [
      {
        ...role,
        harmony,
        transpositionPlan: undefined
      }
    ];
    song.sections[0]!.partGraph = [
      { role_id: role.id, is_active: true, handoff_to: [], handoff_from: [] }
    ];
    Object.setPrototypeOf(song.sections[0]!.roles[0]!, {
      transpositionPlan: "inherited plan"
    });
    expect(resolveTonightStartingChord(song)?.chord).not.toBe("C#m7");
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("contains an own tempo accessor that throws", () => {
    const song = createDemoRehearsalSong();
    Object.defineProperty(song, "tempo", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("tempo getter must stay data");
      }
    });

    expect(() => resolveTonightTempo(song)).not.toThrow();
    expect(resolveTonightTempo(song)).toBeNull();
  });

  it("contains an own timeRange accessor that throws", () => {
    const song = createDemoRehearsalSong();
    Object.defineProperty(song.sections[0]!, "timeRange", {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error("timeRange getter must stay data");
      }
    });

    expect(() => resolveTonightStartingChord(song)).not.toThrow();
    expect(() => resolveTonightTransposePlan(song)).not.toThrow();
    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });

  it("contains a nested timeRange Proxy whose descriptor trap throws", () => {
    const song = createDemoRehearsalSong();
    song.sections[0]!.timeRange = new Proxy(
      { start: 0, end: 8 },
      {
        getOwnPropertyDescriptor() {
          throw new Error("timeRange descriptor trap");
        }
      }
    ) as typeof song.sections[0]["timeRange"];

    expect(() => resolveTonightStartingChord(song)).not.toThrow();
    expect(() => resolveTonightTransposePlan(song)).not.toThrow();
    expect(resolveTonightStartingChord(song)).toBeNull();
    expect(resolveTonightTransposePlan(song)).toBeNull();
  });
});
