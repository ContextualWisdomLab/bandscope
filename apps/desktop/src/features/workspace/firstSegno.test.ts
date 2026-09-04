import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillSegnoCopy,
  firstSegnoPlan,
  isTrustedSegnoLabel,
  lastNamedSectionLabel,
  MAX_SEGNO_LABEL_LENGTH,
  trustedSegno
} from "./firstSegno";

describe("trustedSegno", () => {
  it("admits only Gould/MusicXML Segno and Segno 1–9 labels", () => {
    expect(trustedSegno({ label: "Segno" })).toEqual({ label: "Segno" });
    expect(trustedSegno({ label: "Segno 1" })).toEqual({ label: "Segno 1" });
    expect(trustedSegno({ label: "Segno 9" })).toEqual({ label: "Segno 9" });
    expect(trustedSegno({ label: "segno" })).toBeNull();
    expect(trustedSegno({ label: "SEGNO" })).toBeNull();
    expect(trustedSegno({ label: " Segno" })).toBeNull();
    expect(trustedSegno({ label: "Segno " })).toBeNull();
    expect(trustedSegno({ label: "D.S." })).toBeNull();
    expect(trustedSegno({ label: "Dal Segno" })).toBeNull();
    expect(trustedSegno({ label: "Segno 0" })).toBeNull();
    expect(trustedSegno({ label: "Segno 10" })).toBeNull();
    expect(trustedSegno({ label: "" })).toBeNull();
    expect(trustedSegno({ label: "Segno", extra: true })).toBeNull();
    expect(trustedSegno({ text: "Segno" })).toBeNull();
    expect(trustedSegno(null)).toBeNull();
    expect(trustedSegno("Segno")).toBeNull();
    expect(MAX_SEGNO_LABEL_LENGTH).toBe(7);
  });
});

describe("isTrustedSegnoLabel", () => {
  it("rejects lowercase, dal segno, padded, and overlong tokens", () => {
    expect(isTrustedSegnoLabel("Segno")).toBe(true);
    expect(isTrustedSegnoLabel("Segno 2")).toBe(true);
    expect(isTrustedSegnoLabel("segno")).toBe(false);
    expect(isTrustedSegnoLabel("Segno 01")).toBe(false);
    expect(isTrustedSegnoLabel("Segno.")).toBe(false);
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

describe("firstSegnoPlan", () => {
  it("builds a Segno return plan from the demo song", () => {
    expect(firstSegnoPlan(createDemoRehearsalSong())).toEqual({
      label: "Segno",
      sectionLabel: "verse"
    });
  });

  it("uses the final meaningful section as the return-after anchor", () => {
    expect(
      firstSegnoPlan({
        segno: { label: "Segno 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({
      label: "Segno 2",
      sectionLabel: "outro"
    });
  });

  it("fails closed without a trusted segno and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.segno;
    expect(firstSegnoPlan(song)).toBeNull();
    expect(firstSegnoPlan(undefined)).toBeNull();
    expect(firstSegnoPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.segno = { label: "Segno 3" };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstSegnoPlan(unlabeled)).toEqual({
      label: "Segno 3",
      sectionLabel: undefined
    });
  });
});

describe("fillSegnoCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillSegnoCopy("Tonight's first segno is {label}. Return to {label} after the {sectionLabel}.", {
        label: "Segno",
        sectionLabel: "verse {label}"
      })
    ).toBe("Tonight's first segno is Segno. Return to Segno after the verse {label}.");
    expect(fillSegnoCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
