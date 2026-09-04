import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  countInOnsetsMs,
  DEFAULT_COUNT_IN_BEATS,
  fillCountInCopy,
  firstCountInPlan,
  firstNamedSectionLabel,
  MAX_COUNT_IN_BEATS,
  MAX_TRUSTED_TEMPO_BPM,
  MIN_TRUSTED_TEMPO_BPM,
  trustedTempoBpm
} from "./firstCountIn";

describe("trustedTempoBpm", () => {
  it("admits only finite rehearsal-usable BPM in 20–400", () => {
    expect(trustedTempoBpm(120)).toBe(120);
    expect(trustedTempoBpm(MIN_TRUSTED_TEMPO_BPM)).toBe(20);
    expect(trustedTempoBpm(MAX_TRUSTED_TEMPO_BPM)).toBe(400);
    expect(trustedTempoBpm(19)).toBeNull();
    expect(trustedTempoBpm(401)).toBeNull();
    expect(trustedTempoBpm(0)).toBeNull();
    expect(trustedTempoBpm(-80)).toBeNull();
    expect(trustedTempoBpm(Number.NaN)).toBeNull();
    expect(trustedTempoBpm(Number.POSITIVE_INFINITY)).toBeNull();
    expect(trustedTempoBpm("120")).toBeNull();
    expect(trustedTempoBpm(undefined)).toBeNull();
  });
});

describe("firstNamedSectionLabel", () => {
  it("returns the first meaningful section label and isolates malformed entries", () => {
    const song = createDemoRehearsalSong();
    expect(firstNamedSectionLabel(song)).toBe("verse");

    song.sections[0]!.label = " none ";
    expect(firstNamedSectionLabel(song)).toBe(song.sections[1]?.label);

    expect(firstNamedSectionLabel(null)).toBeUndefined();
    expect(firstNamedSectionLabel({ sections: "nope" })).toBeUndefined();
    expect(firstNamedSectionLabel({ sections: [null, "x", { label: "  " }, { label: "chorus" }] })).toBe(
      "chorus"
    );
  });
});

describe("firstCountInPlan", () => {
  it("builds a four-beat plan from the demo song tempo and first named section", () => {
    const plan = firstCountInPlan(createDemoRehearsalSong());
    expect(plan).toEqual({
      tempoBpm: 120,
      beats: DEFAULT_COUNT_IN_BEATS,
      intervalMs: 500,
      sectionLabel: "verse"
    });
  });

  it("fails closed without a trusted tempo and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    song.tempo = 12;
    expect(firstCountInPlan(song)).toBeNull();
    expect(firstCountInPlan(undefined)).toBeNull();
    expect(firstCountInPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstCountInPlan(unlabeled)).toEqual({
      tempoBpm: 120,
      beats: DEFAULT_COUNT_IN_BEATS,
      intervalMs: 500,
      sectionLabel: undefined
    });
  });
});

describe("countInOnsetsMs", () => {
  it("returns one onset per trusted beat and rejects malformed plans", () => {
    expect(countInOnsetsMs({ tempoBpm: 120, beats: 4, intervalMs: 500 })).toEqual([0, 500, 1000, 1500]);
    expect(countInOnsetsMs({ tempoBpm: 120, beats: 0, intervalMs: 500 })).toEqual([]);
    expect(countInOnsetsMs({ tempoBpm: 120, beats: MAX_COUNT_IN_BEATS + 1, intervalMs: 500 })).toEqual([]);
    expect(countInOnsetsMs({ tempoBpm: 120, beats: 4, intervalMs: 0 })).toEqual([]);
    expect(countInOnsetsMs({ tempoBpm: 120, beats: 4, intervalMs: Number.NaN })).toEqual([]);
    expect(countInOnsetsMs(null)).toEqual([]);
  });

  it("fails closed when a finite interval overflows a later beat onset", () => {
    expect(countInOnsetsMs({ tempoBpm: 120, beats: 3, intervalMs: Number.MAX_VALUE })).toEqual([]);
  });
});

describe("fillCountInCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillCountInCopy("Count in {beats} at {tempo} BPM before the {sectionLabel}.", {
        beats: "4",
        tempo: "120",
        sectionLabel: "verse {tempo}"
      })
    ).toBe("Count in 4 at 120 BPM before the verse {tempo}.");
    expect(fillCountInCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
