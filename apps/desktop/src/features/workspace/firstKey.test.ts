import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillKeyCopy,
  firstKeyPlan,
  firstNamedSectionLabel,
  keyLabel,
  keyTonic,
  MAX_KEY_FIFTHS,
  MIN_KEY_FIFTHS,
  trustedKey
} from "./firstKey";

describe("trustedKey", () => {
  it("admits only MusicXML-shaped integer fifths and major/minor mode", () => {
    expect(trustedKey({ fifths: 4, mode: "major" })).toEqual({ fifths: 4, mode: "major" });
    expect(trustedKey({ fifths: MIN_KEY_FIFTHS, mode: "minor" })).toEqual({ fifths: -7, mode: "minor" });
    expect(trustedKey({ fifths: MAX_KEY_FIFTHS, mode: "major" })).toEqual({ fifths: 7, mode: "major" });
    expect(trustedKey({ fifths: -8, mode: "major" })).toBeNull();
    expect(trustedKey({ fifths: MAX_KEY_FIFTHS + 1, mode: "major" })).toBeNull();
    expect(trustedKey({ fifths: 1.5, mode: "major" })).toBeNull();
    expect(trustedKey({ fifths: 4, mode: "dorian" })).toBeNull();
    expect(trustedKey({ fifths: 4, mode: "Major" })).toBeNull();
    expect(trustedKey({ fifths: "4", mode: "major" })).toBeNull();
    expect(trustedKey({ fifths: 4, mode: "major", extra: true })).toBeNull();
    expect(trustedKey(null)).toBeNull();
    expect(trustedKey("E major")).toBeNull();
  });
});

describe("keyTonic and keyLabel", () => {
  it("spells sharp, flat, major, and minor tonics from the circle of fifths", () => {
    expect(keyTonic({ fifths: 0, mode: "major" })).toBe("C");
    expect(keyLabel({ fifths: 0, mode: "major" })).toBe("C major");
    expect(keyLabel({ fifths: 4, mode: "major" })).toBe("E major");
    expect(keyLabel({ fifths: -2, mode: "major" })).toBe("Bb major");
    expect(keyLabel({ fifths: 4, mode: "minor" })).toBe("C# minor");
    expect(keyLabel({ fifths: -1, mode: "minor" })).toBe("D minor");
    expect(keyLabel({ fifths: 7, mode: "major" })).toBe("C# major");
    expect(keyLabel({ fifths: -7, mode: "major" })).toBe("Cb major");
    expect(keyLabel({ fifths: -7, mode: "minor" })).toBe("Ab minor");
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

describe("firstKeyPlan", () => {
  it("builds an E major tuning plan from the demo song", () => {
    expect(firstKeyPlan(createDemoRehearsalSong())).toEqual({
      fifths: 4,
      mode: "major",
      tonic: "E",
      label: "E major",
      sectionLabel: "verse"
    });
  });

  it("fails closed without a trusted key and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.key;
    expect(firstKeyPlan(song)).toBeNull();
    expect(firstKeyPlan(undefined)).toBeNull();
    expect(firstKeyPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.key = { fifths: -3, mode: "major" };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstKeyPlan(unlabeled)).toEqual({
      fifths: -3,
      mode: "major",
      tonic: "Eb",
      label: "Eb major",
      sectionLabel: undefined
    });
  });
});

describe("fillKeyCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillKeyCopy("Tonight's first key is {label}. Tune to {tonic} before the {sectionLabel}.", {
        label: "E major",
        tonic: "E",
        sectionLabel: "verse {label}"
      })
    ).toBe("Tonight's first key is E major. Tune to E before the verse {label}.");
    expect(fillKeyCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
