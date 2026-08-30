import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillDalSegnoCopy,
  firstDalSegnoPlan,
  firstNamedSectionLabel,
  isTrustedDalSegnoLabel,
  MAX_DAL_SEGNO_LABEL_LENGTH,
  trustedDalSegno
} from "./firstDalSegno";

describe("trustedDalSegno", () => {
  it("admits only Gould/MusicXML D.S. and D.S. 1–9 labels", () => {
    expect(trustedDalSegno({ label: "D.S." })).toEqual({ label: "D.S." });
    expect(trustedDalSegno({ label: "D.S. 1" })).toEqual({ label: "D.S. 1" });
    expect(trustedDalSegno({ label: "D.S. 9" })).toEqual({ label: "D.S. 9" });
    expect(trustedDalSegno({ label: "d.s." })).toBeNull();
    expect(trustedDalSegno({ label: "DS" })).toBeNull();
    expect(trustedDalSegno({ label: " D.S." })).toBeNull();
    expect(trustedDalSegno({ label: "D.S. " })).toBeNull();
    expect(trustedDalSegno({ label: "Fine" })).toBeNull();
    expect(trustedDalSegno({ label: "D.S. al Coda" })).toBeNull();
    expect(trustedDalSegno({ label: "D.S. al Fine" })).toBeNull();
    expect(trustedDalSegno({ label: "Dal Segno" })).toBeNull();
    expect(trustedDalSegno({ label: "D.C." })).toBeNull();
    expect(trustedDalSegno({ label: "segno" })).toBeNull();
    expect(trustedDalSegno({ label: "D.S. 0" })).toBeNull();
    expect(trustedDalSegno({ label: "D.S. 10" })).toBeNull();
    expect(trustedDalSegno({ label: "" })).toBeNull();
    expect(trustedDalSegno({ label: "D.S.", extra: true })).toBeNull();
    expect(trustedDalSegno({ text: "D.S." })).toBeNull();
    expect(trustedDalSegno(null)).toBeNull();
    expect(trustedDalSegno("D.S.")).toBeNull();
    expect(MAX_DAL_SEGNO_LABEL_LENGTH).toBe(6);
  });
});

describe("isTrustedDalSegnoLabel", () => {
  it("rejects lowercase, spelled-out dal segno, padded, and overlong tokens", () => {
    expect(isTrustedDalSegnoLabel("D.S.")).toBe(true);
    expect(isTrustedDalSegnoLabel("D.S. 2")).toBe(true);
    expect(isTrustedDalSegnoLabel("d.s.")).toBe(false);
    expect(isTrustedDalSegnoLabel("D.S. 01")).toBe(false);
    expect(isTrustedDalSegnoLabel("D.S..")).toBe(false);
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

describe("firstDalSegnoPlan", () => {
  it("builds a Dal Segno restart plan from the demo song", () => {
    expect(firstDalSegnoPlan(createDemoRehearsalSong())).toEqual({
      label: "D.S.",
      sectionLabel: "verse"
    });
  });

  it("uses the first meaningful section as the restart-at-the-segno anchor", () => {
    expect(
      firstDalSegnoPlan({
        dalSegno: { label: "D.S. 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({
      label: "D.S. 2",
      sectionLabel: "intro"
    });
  });

  it("fails closed without a trusted Dal Segno and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.dalSegno;
    expect(firstDalSegnoPlan(song)).toBeNull();
    expect(firstDalSegnoPlan(undefined)).toBeNull();
    expect(firstDalSegnoPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.dalSegno = { label: "D.S. 3" };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstDalSegnoPlan(unlabeled)).toEqual({
      label: "D.S. 3",
      sectionLabel: undefined
    });
  });
});

describe("fillDalSegnoCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillDalSegnoCopy("Tonight's first Dal Segno is {label}: go back to the segno at {label} and start the first {sectionLabel}.", {
        label: "D.S.",
        sectionLabel: "verse {label}"
      })
    ).toBe("Tonight's first Dal Segno is D.S.: go back to the segno at D.S. and start the first verse {label}.");
    expect(fillDalSegnoCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
