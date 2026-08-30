import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillFineCopy,
  firstFinePlan,
  isTrustedFineLabel,
  lastNamedSectionLabel,
  MAX_FINE_LABEL_LENGTH,
  trustedFine
} from "./firstFine";

describe("trustedFine", () => {
  it("admits only Gould/MusicXML Fine and Fine 1–9 labels", () => {
    expect(trustedFine({ label: "Fine" })).toEqual({ label: "Fine" });
    expect(trustedFine({ label: "Fine 1" })).toEqual({ label: "Fine 1" });
    expect(trustedFine({ label: "Fine 9" })).toEqual({ label: "Fine 9" });
    expect(trustedFine({ label: "fine" })).toBeNull();
    expect(trustedFine({ label: "FINE" })).toBeNull();
    expect(trustedFine({ label: " Fine" })).toBeNull();
    expect(trustedFine({ label: "Fine " })).toBeNull();
    expect(trustedFine({ label: "D.C." })).toBeNull();
    expect(trustedFine({ label: "D.C. al Fine" })).toBeNull();
    expect(trustedFine({ label: "Da Capo" })).toBeNull();
    expect(trustedFine({ label: "Fine 0" })).toBeNull();
    expect(trustedFine({ label: "Fine 10" })).toBeNull();
    expect(trustedFine({ label: "" })).toBeNull();
    expect(trustedFine({ label: "Fine", extra: true })).toBeNull();
    expect(trustedFine({ text: "Fine" })).toBeNull();
    expect(trustedFine(null)).toBeNull();
    expect(trustedFine("Fine")).toBeNull();
    expect(MAX_FINE_LABEL_LENGTH).toBe(6);
  });
});

describe("isTrustedFineLabel", () => {
  it("rejects lowercase, da capo, padded, and overlong tokens", () => {
    expect(isTrustedFineLabel("Fine")).toBe(true);
    expect(isTrustedFineLabel("Fine 2")).toBe(true);
    expect(isTrustedFineLabel("fine")).toBe(false);
    expect(isTrustedFineLabel("Fine 01")).toBe(false);
    expect(isTrustedFineLabel("Fine.")).toBe(false);
  });
});

describe("lastNamedSectionLabel", () => {
  it("returns the last meaningful section label and isolates malformed entries", () => {
    expect(
      lastNamedSectionLabel({
        sections: [
          { label: "intro" },
          { label: " none " },
          null,
          { label: "outro" },
          { label: "  " }
        ]
      })
    ).toBe("outro");

    expect(lastNamedSectionLabel(null)).toBeUndefined();
    expect(lastNamedSectionLabel({ sections: "nope" })).toBeUndefined();
    expect(lastNamedSectionLabel({ sections: [null, "x", { label: "  " }] })).toBeUndefined();
  });
});

describe("firstFinePlan", () => {
  it("builds a Fine end plan from the demo song", () => {
    expect(firstFinePlan(createDemoRehearsalSong())).toEqual({
      label: "Fine",
      sectionLabel: "verse"
    });
  });

  it("uses the final meaningful section as the end-after anchor", () => {
    expect(
      firstFinePlan({
        fine: { label: "Fine 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({
      label: "Fine 2",
      sectionLabel: "outro"
    });
  });

  it("fails closed without a trusted Fine and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.fine;
    expect(firstFinePlan(song)).toBeNull();
    expect(firstFinePlan(undefined)).toBeNull();
    expect(firstFinePlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.fine = { label: "Fine 3" };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstFinePlan(unlabeled)).toEqual({
      label: "Fine 3",
      sectionLabel: undefined
    });
  });
});

describe("fillFineCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillFineCopy("Tonight's first Fine is {label}. End together at {label} after the {sectionLabel}.", {
        label: "Fine",
        sectionLabel: "verse {label}"
      })
    ).toBe("Tonight's first Fine is Fine. End together at Fine after the verse {label}.");
    expect(fillFineCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
