import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { firstClickPlan, formatTempoBpm, trustedTempoBpm } from "./firstClickPlan";

describe("trustedTempoBpm", () => {
  it("accepts finite rehearsal tempos", () => {
    expect(trustedTempoBpm(120)).toBe(120);
    expect(trustedTempoBpm(92.5)).toBe(92.5);
    expect(trustedTempoBpm(20)).toBe(20);
    expect(trustedTempoBpm(400)).toBe(400);
  });

  it("fails closed on missing, non-finite, or out-of-range values", () => {
    for (const value of [undefined, null, "120", 0, -12, 19.9, 400.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(trustedTempoBpm(value)).toBeNull();
    }
  });
});

describe("formatTempoBpm", () => {
  it("keeps whole BPM as integers and bounds fractional BPM to one decimal", () => {
    expect(formatTempoBpm(120)).toBe("120");
    expect(formatTempoBpm(92.5)).toBe("92.5");
    expect(formatTempoBpm(92.49)).toBe("92.5");
  });
});

describe("firstClickPlan", () => {
  it("names the demo song tempo before the first labeled section", () => {
    expect(firstClickPlan(createDemoRehearsalSong())).toEqual({
      tempoBpm: 120,
      sectionLabel: "verse"
    });
  });

  it("skips unlabeled sections until a named section exists", () => {
    const song = createDemoRehearsalSong();
    const unlabeled = { ...song.sections[0]!, id: "blank-1", label: " " };
    const chorus = { ...song.sections[0]!, id: "chorus-1", label: "chorus" };
    song.sections = [unlabeled, chorus];

    expect(firstClickPlan(song)).toEqual({
      tempoBpm: 120,
      sectionLabel: "chorus"
    });
  });

  it("keeps a trusted tempo when every section is unlabeled", () => {
    const song = createDemoRehearsalSong();
    song.sections = [{ ...song.sections[0]!, id: "blank-1", label: " " }];

    expect(firstClickPlan(song)).toEqual({
      tempoBpm: 120,
      sectionLabel: null
    });
  });

  it("returns null when tempo is missing or unusable", () => {
    const song = createDemoRehearsalSong();
    delete song.tempo;
    expect(firstClickPlan(song)).toBeNull();

    song.tempo = 0;
    expect(firstClickPlan(song)).toBeNull();
  });

  it("fails closed on malformed runtime roots and collections", () => {
    for (const malformed of [null, {}, { tempo: 120, sections: null }]) {
      expect(firstClickPlan(malformed as unknown as RehearsalSong)).toBeNull();
    }

    expect(firstClickPlan({ tempo: 120, sections: [null] } as unknown as RehearsalSong)).toEqual({
      tempoBpm: 120,
      sectionLabel: null
    });
  });

  it("rejects Proxy roots instead of trusting substituted runtime values", () => {
    const song = createDemoRehearsalSong();
    const firstSection = song.sections[0]!;
    const sectionProxy = new Proxy(firstSection, {
      get(target, property, receiver) {
        if (property === "label") {
          return "proxy-section";
        }
        return Reflect.get(target, property, receiver);
      }
    });
    const runtimeSong = { ...song, sections: [sectionProxy] };
    const songProxy = new Proxy(runtimeSong, {
      get(target, property, receiver) {
        if (property === "tempo") {
          return 222;
        }
        if (property === "sections") {
          return [{ ...firstSection, label: "proxy-root-section" }];
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(firstClickPlan(songProxy as RehearsalSong)).toBeNull();
  });

  it("rejects Proxy descriptor traps that fabricate data properties", () => {
    const song = createDemoRehearsalSong();
    const forged = new Proxy(song, {
      getOwnPropertyDescriptor(target, property) {
        if (property === "tempo") {
          return {
            configurable: true,
            enumerable: true,
            value: 360,
            writable: true
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      }
    });

    expect(firstClickPlan(forged as RehearsalSong)).toBeNull();
  });
});
