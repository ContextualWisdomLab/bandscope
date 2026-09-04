import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillBarCopy,
  firstBarPlan,
  MAX_MEASURE_START,
  MIN_MEASURE_START,
  trustedMeasureStart
} from "./firstBar";

describe("trustedMeasureStart", () => {
  it("admits only finite integer chart bars inside the printed-score bound", () => {
    expect(trustedMeasureStart(9)).toBe(9);
    expect(trustedMeasureStart(MIN_MEASURE_START)).toBe(1);
    expect(trustedMeasureStart(MAX_MEASURE_START)).toBe(9_999);
    expect(trustedMeasureStart(0)).toBeNull();
    expect(trustedMeasureStart(-1)).toBeNull();
    expect(trustedMeasureStart(MAX_MEASURE_START + 1)).toBeNull();
    expect(trustedMeasureStart(1.5)).toBeNull();
    expect(trustedMeasureStart("9")).toBeNull();
    expect(trustedMeasureStart(Number.NaN)).toBeNull();
    expect(trustedMeasureStart(null)).toBeNull();
  });
});

describe("firstBarPlan", () => {
  it("builds a bar 9 count-in plan from the demo song", () => {
    expect(firstBarPlan(createDemoRehearsalSong())).toEqual({
      measureStart: 9,
      barLabel: "9",
      sectionLabel: "verse"
    });
  });

  it("fails closed without a trusted bar and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.sections[0]!.measureStart;
    expect(firstBarPlan(song)).toBeNull();
    expect(firstBarPlan(undefined)).toBeNull();
    expect(firstBarPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.sections = unlabeled.sections.map((section) => ({
      ...section,
      label: "none" as typeof section.label,
      measureStart: 12
    }));
    expect(firstBarPlan(unlabeled)).toEqual({
      measureStart: 12,
      barLabel: "12",
      sectionLabel: undefined
    });
  });

  it("skips malformed sections until a trusted chart bar remains", () => {
    const song = createDemoRehearsalSong();
    const second = structuredClone(song.sections[0]!);
    second.id = "chorus-1";
    second.label = "chorus";
    second.measureStart = 17;
    song.sections = [
      null as unknown as (typeof song.sections)[0],
      { ...song.sections[0]!, measureStart: 0 },
      second
    ];
    expect(firstBarPlan(song)).toEqual({
      measureStart: 17,
      barLabel: "17",
      sectionLabel: "chorus"
    });
  });
});

describe("fillBarCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillBarCopy("Count into bar {barLabel} before the {sectionLabel}.", {
        barLabel: "9",
        sectionLabel: "verse {barLabel}"
      })
    ).toBe("Count into bar 9 before the verse {barLabel}.");
    expect(fillBarCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
