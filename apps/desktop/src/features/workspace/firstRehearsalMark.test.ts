import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillRehearsalMarkCopy,
  firstNamedSectionLabel,
  firstRehearsalMarkPlan,
  isTrustedRehearsalMarkText,
  MAX_REHEARSAL_MARK_TEXT_LENGTH,
  trustedRehearsalMark
} from "./firstRehearsalMark";

describe("trustedRehearsalMark", () => {
  it("admits only Gould/MusicXML letter and number marks", () => {
    expect(trustedRehearsalMark({ text: "A" })).toEqual({ text: "A" });
    expect(trustedRehearsalMark({ text: "Z" })).toEqual({ text: "Z" });
    expect(trustedRehearsalMark({ text: "AA" })).toEqual({ text: "AA" });
    expect(trustedRehearsalMark({ text: "1" })).toEqual({ text: "1" });
    expect(trustedRehearsalMark({ text: "99" })).toEqual({ text: "99" });
    expect(trustedRehearsalMark({ text: "a" })).toBeNull();
    expect(trustedRehearsalMark({ text: " A" })).toBeNull();
    expect(trustedRehearsalMark({ text: "A " })).toBeNull();
    expect(trustedRehearsalMark({ text: "A1" })).toBeNull();
    expect(trustedRehearsalMark({ text: "0" })).toBeNull();
    expect(trustedRehearsalMark({ text: "00" })).toBeNull();
    expect(trustedRehearsalMark({ text: "100" })).toBeNull();
    expect(trustedRehearsalMark({ text: "AAA" })).toBeNull();
    expect(trustedRehearsalMark({ text: "" })).toBeNull();
    expect(trustedRehearsalMark({ text: "A", extra: true })).toBeNull();
    expect(trustedRehearsalMark({ letter: "A" })).toBeNull();
    expect(trustedRehearsalMark(null)).toBeNull();
    expect(trustedRehearsalMark("A")).toBeNull();
    expect(MAX_REHEARSAL_MARK_TEXT_LENGTH).toBe(2);
  });
});

describe("isTrustedRehearsalMarkText", () => {
  it("rejects lowercase, mixed, padded, and overlong tokens", () => {
    expect(isTrustedRehearsalMarkText("B")).toBe(true);
    expect(isTrustedRehearsalMarkText("12")).toBe(true);
    expect(isTrustedRehearsalMarkText("b")).toBe(false);
    expect(isTrustedRehearsalMarkText("01")).toBe(false);
    expect(isTrustedRehearsalMarkText("I.")).toBe(false);
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

describe("firstRehearsalMarkPlan", () => {
  it("builds an A-letter start plan from the demo song", () => {
    expect(firstRehearsalMarkPlan(createDemoRehearsalSong())).toEqual({
      text: "A",
      sectionLabel: "verse"
    });
  });

  it("fails closed without a trusted mark and omits blank section labels", () => {
    const song = createDemoRehearsalSong();
    delete song.rehearsalMark;
    expect(firstRehearsalMarkPlan(song)).toBeNull();
    expect(firstRehearsalMarkPlan(undefined)).toBeNull();
    expect(firstRehearsalMarkPlan([])).toBeNull();

    const unlabeled = createDemoRehearsalSong();
    unlabeled.rehearsalMark = { text: "B" };
    unlabeled.sections = unlabeled.sections.map((section) => ({ ...section, label: "none" }));
    expect(firstRehearsalMarkPlan(unlabeled)).toEqual({
      text: "B",
      sectionLabel: undefined
    });
  });
});

describe("fillRehearsalMarkCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillRehearsalMarkCopy("Tonight's first mark is {text}. Start together at {text} before the {sectionLabel}.", {
        text: "A",
        sectionLabel: "verse {text}"
      })
    ).toBe("Tonight's first mark is A. Start together at A before the verse {text}.");
    expect(fillRehearsalMarkCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
