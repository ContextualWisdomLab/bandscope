import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillCodaCopy,
  firstCodaPlan,
  isTrustedCodaLabel,
  lastNamedSectionLabel,
  trustedCoda
} from "./firstCoda";

describe("trustedCoda", () => {
  it("admits only Gould/MusicXML Coda and Coda 1–9 labels", () => {
    expect(trustedCoda({ label: "Coda" })).toEqual({ label: "Coda" });
    expect(trustedCoda({ label: "Coda 1" })).toEqual({ label: "Coda 1" });
    expect(trustedCoda({ label: "Coda 9" })).toEqual({ label: "Coda 9" });
    expect(trustedCoda({ label: "coda" })).toBeNull();
    expect(trustedCoda({ label: "CODA" })).toBeNull();
    expect(trustedCoda({ label: " Coda" })).toBeNull();
    expect(trustedCoda({ label: "Coda " })).toBeNull();
    expect(trustedCoda({ label: "To Coda" })).toBeNull();
    expect(trustedCoda({ label: "Coda 0" })).toBeNull();
    expect(trustedCoda({ label: "Coda 10" })).toBeNull();
    expect(trustedCoda({ label: "" })).toBeNull();
    expect(trustedCoda({ label: "Coda", extra: true })).toBeNull();
    expect(trustedCoda({ text: "Coda" })).toBeNull();
    expect(trustedCoda(null)).toBeNull();
    expect(trustedCoda("Coda")).toBeNull();
  });
});

describe("isTrustedCodaLabel", () => {
  it("rejects lowercase, to-coda, padded, and overlong tokens", () => {
    expect(isTrustedCodaLabel("Coda")).toBe(true);
    expect(isTrustedCodaLabel("Coda 2")).toBe(true);
    expect(isTrustedCodaLabel("coda")).toBe(false);
    expect(isTrustedCodaLabel("Coda 01")).toBe(false);
    expect(isTrustedCodaLabel("Coda.")).toBe(false);
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

describe("firstCodaPlan", () => {
  it("builds a Coda jump plan from the demo song", () => {
    expect(firstCodaPlan(createDemoRehearsalSong())).toEqual({
      label: "Coda",
      sectionLabel: "verse"
    });
  });

  it("uses the final meaningful section as the jump-after anchor", () => {
    expect(
      firstCodaPlan({
        coda: { label: "Coda 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({
      label: "Coda 2",
      sectionLabel: "outro"
    });
  });

  it("fails closed without a trusted coda and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.coda;
    expect(firstCodaPlan(song)).toBeNull();
    expect(firstCodaPlan(undefined)).toBeNull();
    expect(firstCodaPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.coda = { label: "Coda 3" };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstCodaPlan(unlabeled)).toEqual({
      label: "Coda 3",
      sectionLabel: undefined
    });
  });
});

describe("fillCodaCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillCodaCopy("Tonight's first coda is {label}. Jump to {label} after the {sectionLabel}.", {
        label: "Coda",
        sectionLabel: "verse {label}"
      })
    ).toBe("Tonight's first coda is Coda. Jump to Coda after the verse {label}.");
    expect(fillCodaCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
