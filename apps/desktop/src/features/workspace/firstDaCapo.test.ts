import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillDaCapoCopy,
  firstDaCapoPlan,
  firstNamedSectionLabel,
  isTrustedDaCapoLabel,
  MAX_DA_CAPO_LABEL_LENGTH,
  trustedDaCapo
} from "./firstDaCapo";

describe("trustedDaCapo", () => {
  it("admits only Gould/MusicXML D.C. and D.C. 1–9 labels", () => {
    expect(trustedDaCapo({ label: "D.C." })).toEqual({ label: "D.C." });
    expect(trustedDaCapo({ label: "D.C. 1" })).toEqual({ label: "D.C. 1" });
    expect(trustedDaCapo({ label: "D.C. 9" })).toEqual({ label: "D.C. 9" });
    expect(trustedDaCapo({ label: "d.c." })).toBeNull();
    expect(trustedDaCapo({ label: "DC" })).toBeNull();
    expect(trustedDaCapo({ label: " D.C." })).toBeNull();
    expect(trustedDaCapo({ label: "D.C. " })).toBeNull();
    expect(trustedDaCapo({ label: "Fine" })).toBeNull();
    expect(trustedDaCapo({ label: "D.C. al Fine" })).toBeNull();
    expect(trustedDaCapo({ label: "Da Capo" })).toBeNull();
    expect(trustedDaCapo({ label: "D.S." })).toBeNull();
    expect(trustedDaCapo({ label: "D.C. 0" })).toBeNull();
    expect(trustedDaCapo({ label: "D.C. 10" })).toBeNull();
    expect(trustedDaCapo({ label: "" })).toBeNull();
    expect(trustedDaCapo({ label: "D.C.", extra: true })).toBeNull();
    expect(trustedDaCapo({ text: "D.C." })).toBeNull();
    expect(trustedDaCapo(null)).toBeNull();
    expect(trustedDaCapo("D.C.")).toBeNull();
    expect(MAX_DA_CAPO_LABEL_LENGTH).toBe(6);
  });
});

describe("isTrustedDaCapoLabel", () => {
  it("rejects lowercase, spelled-out da capo, padded, and overlong tokens", () => {
    expect(isTrustedDaCapoLabel("D.C.")).toBe(true);
    expect(isTrustedDaCapoLabel("D.C. 2")).toBe(true);
    expect(isTrustedDaCapoLabel("d.c.")).toBe(false);
    expect(isTrustedDaCapoLabel("D.C. 01")).toBe(false);
    expect(isTrustedDaCapoLabel("D.C..")).toBe(false);
  });
});

describe("firstNamedSectionLabel", () => {
  it("returns the first meaningful section label and isolates malformed entries", () => {
    expect(
      firstNamedSectionLabel({
        sections: [
          { label: "  " },
          null,
          { label: " none " },
          { label: "intro" },
          { label: "outro" }
        ]
      })
    ).toBe("intro");

    expect(firstNamedSectionLabel(null)).toBeUndefined();
    expect(firstNamedSectionLabel({ sections: "nope" })).toBeUndefined();
    expect(firstNamedSectionLabel({ sections: [null, "x", { label: "  " }] })).toBeUndefined();
  });
});

describe("firstDaCapoPlan", () => {
  it("builds a Da Capo restart plan from the demo song", () => {
    expect(firstDaCapoPlan(createDemoRehearsalSong())).toEqual({
      label: "D.C.",
      sectionLabel: "verse"
    });
  });

  it("uses the first meaningful section as the restart-at-the-beginning anchor", () => {
    expect(
      firstDaCapoPlan({
        daCapo: { label: "D.C. 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({
      label: "D.C. 2",
      sectionLabel: "intro"
    });
  });

  it("fails closed without a trusted Da Capo and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.daCapo;
    expect(firstDaCapoPlan(song)).toBeNull();
    expect(firstDaCapoPlan(undefined)).toBeNull();
    expect(firstDaCapoPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.daCapo = { label: "D.C. 3" };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstDaCapoPlan(unlabeled)).toEqual({
      label: "D.C. 3",
      sectionLabel: undefined
    });
  });
});

describe("fillDaCapoCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillDaCapoCopy("Tonight's first Da Capo is {label}: go back to the beginning at {label} and start the first {sectionLabel}.", {
        label: "D.C.",
        sectionLabel: "verse {label}"
      })
    ).toBe("Tonight's first Da Capo is D.C.: go back to the beginning at D.C. and start the first verse {label}.");
    expect(fillDaCapoCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
