import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  countInBeatsForMeter,
  fillMeterCopy,
  firstMeterPlan,
  firstNamedSectionLabel,
  MAX_METER_BEATS,
  MIN_METER_BEATS,
  trustedMeter
} from "./firstMeter";

describe("trustedMeter", () => {
  it("admits only MusicXML-shaped integer beats and beat-type", () => {
    expect(trustedMeter({ beats: 4, beatType: 4 })).toEqual({ beats: 4, beatType: 4 });
    expect(trustedMeter({ beats: MIN_METER_BEATS, beatType: 1 })).toEqual({ beats: 1, beatType: 1 });
    expect(trustedMeter({ beats: MAX_METER_BEATS, beatType: 16 })).toEqual({ beats: 16, beatType: 16 });
    expect(trustedMeter({ beats: 0, beatType: 4 })).toBeNull();
    expect(trustedMeter({ beats: MAX_METER_BEATS + 1, beatType: 4 })).toBeNull();
    expect(trustedMeter({ beats: 4.5, beatType: 4 })).toBeNull();
    expect(trustedMeter({ beats: 4, beatType: 3 })).toBeNull();
    expect(trustedMeter({ beats: 4, beatType: 32 })).toBeNull();
    expect(trustedMeter({ beats: "4", beatType: 4 })).toBeNull();
    expect(trustedMeter({ beats: 4, beatType: 4, extra: true })).toBeNull();
    expect(trustedMeter(null)).toBeNull();
    expect(trustedMeter("4/4")).toBeNull();
  });
});

describe("countInBeatsForMeter", () => {
  it("counts the dotted-quarter pulse for compound 6/8, 9/8, and 12/8", () => {
    expect(countInBeatsForMeter({ beats: 6, beatType: 8 })).toBe(2);
    expect(countInBeatsForMeter({ beats: 9, beatType: 8 })).toBe(3);
    expect(countInBeatsForMeter({ beats: 12, beatType: 8 })).toBe(4);
  });

  it("counts the written numerator for simple and irregular meters", () => {
    expect(countInBeatsForMeter({ beats: 4, beatType: 4 })).toBe(4);
    expect(countInBeatsForMeter({ beats: 3, beatType: 4 })).toBe(3);
    expect(countInBeatsForMeter({ beats: 2, beatType: 2 })).toBe(2);
    expect(countInBeatsForMeter({ beats: 5, beatType: 4 })).toBe(5);
    expect(countInBeatsForMeter({ beats: 7, beatType: 8 })).toBe(7);
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
    expect(
      firstNamedSectionLabel({ sections: [null, "x", { label: "  " }, { label: "chorus" }] })
    ).toBe("chorus");
  });
});

describe("firstMeterPlan", () => {
  it("builds a 4/4 count-in plan from the demo song", () => {
    expect(firstMeterPlan(createDemoRehearsalSong())).toEqual({
      beats: 4,
      beatType: 4,
      label: "4/4",
      countInBeats: 4,
      sectionLabel: "verse"
    });
  });

  it("fails closed without a trusted meter and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.meter;
    expect(firstMeterPlan(song)).toBeNull();
    expect(firstMeterPlan(undefined)).toBeNull();
    expect(firstMeterPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.meter = { beats: 3, beatType: 4 };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstMeterPlan(unlabeled)).toEqual({
      beats: 3,
      beatType: 4,
      label: "3/4",
      countInBeats: 3,
      sectionLabel: undefined
    });
  });

  it("names 6/8 as a two-click count-in", () => {
    const song = createDemoRehearsalSong();
    song.meter = { beats: 6, beatType: 8 };
    expect(firstMeterPlan(song)).toMatchObject({
      label: "6/8",
      countInBeats: 2,
      sectionLabel: "verse"
    });
  });
});

describe("fillMeterCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillMeterCopy("Tonight's first meter is {label}. Count in {beats} before the {sectionLabel}.", {
        label: "4/4",
        beats: "4",
        sectionLabel: "verse {label}"
      })
    ).toBe("Tonight's first meter is 4/4. Count in 4 before the verse {label}.");
    expect(fillMeterCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
