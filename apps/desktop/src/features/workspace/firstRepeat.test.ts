import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillRepeatCopy,
  firstNamedSectionLabel,
  firstRepeatPlan,
  isTrustedRepeatLabel,
  MAX_REPEAT_LABEL_LENGTH,
  trustedRepeat
} from "./firstRepeat";

describe("trustedRepeat", () => {
  it("admits only Gould start/end-repeat barlines and x2–x9 play-counts", () => {
    expect(trustedRepeat({ label: ":|" })).toEqual({ label: ":|" });
    expect(trustedRepeat({ label: "|:" })).toEqual({ label: "|:" });
    expect(trustedRepeat({ label: "x2" })).toEqual({ label: "x2" });
    expect(trustedRepeat({ label: "x9" })).toEqual({ label: "x9" });
    expect(trustedRepeat({ label: "repeat" })).toBeNull();
    expect(trustedRepeat({ label: "Repeat" })).toBeNull();
    expect(trustedRepeat({ label: "2x" })).toBeNull();
    expect(trustedRepeat({ label: "×2" })).toBeNull();
    expect(trustedRepeat({ label: "x1" })).toBeNull();
    expect(trustedRepeat({ label: "x10" })).toBeNull();
    expect(trustedRepeat({ label: ":||" })).toBeNull();
    expect(trustedRepeat({ label: "||:" })).toBeNull();
    expect(trustedRepeat({ label: " :|" })).toBeNull();
    expect(trustedRepeat({ label: ":| " })).toBeNull();
    expect(trustedRepeat({ label: "D.C." })).toBeNull();
    expect(trustedRepeat({ label: "D.S." })).toBeNull();
    expect(trustedRepeat({ label: "Fine" })).toBeNull();
    expect(trustedRepeat({ label: "" })).toBeNull();
    expect(trustedRepeat({ label: ":|", extra: true })).toBeNull();
    expect(trustedRepeat({ text: ":|" })).toBeNull();
    expect(trustedRepeat(null)).toBeNull();
    expect(trustedRepeat(":|")).toBeNull();
    expect(MAX_REPEAT_LABEL_LENGTH).toBe(2);
  });
});

describe("isTrustedRepeatLabel", () => {
  it("rejects spelled-out, reversed, volta, and overlong tokens", () => {
    expect(isTrustedRepeatLabel(":|")).toBe(true);
    expect(isTrustedRepeatLabel("|:")).toBe(true);
    expect(isTrustedRepeatLabel("x3")).toBe(true);
    expect(isTrustedRepeatLabel("repeat")).toBe(false);
    expect(isTrustedRepeatLabel("x0")).toBe(false);
    expect(isTrustedRepeatLabel("X2")).toBe(false);
    expect(isTrustedRepeatLabel(":||")).toBe(false);
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

describe("firstRepeatPlan", () => {
  it("builds a play-it-again plan from the demo end-repeat without inventing a passage anchor", () => {
    expect(firstRepeatPlan(createDemoRehearsalSong())).toEqual({
      label: ":|",
      sectionLabel: undefined
    });
  });

  it("does not attach a song-level repeat to an unrelated first named section", () => {
    expect(
      firstRepeatPlan({
        repeat: { label: "x2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({
      label: "x2",
      sectionLabel: undefined
    });
  });

  it("fails closed for a start-repeat marker or without a trusted repeat", () => {
    const song = createDemoRehearsalSong();
    delete song.repeat;
    expect(firstRepeatPlan(song)).toBeNull();
    expect(firstRepeatPlan(undefined)).toBeNull();
    expect(firstRepeatPlan([])).toBeNull();

    const startOnly = createDemoRehearsalSong();
    startOnly.repeat = { label: "|:" };
    expect(firstRepeatPlan(startOnly)).toBeNull();
  });
});

describe("fillRepeatCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillRepeatCopy(
        "Tonight's first repeat is {label}: play that passage again at {label} from the first {sectionLabel}.",
        {
          label: ":|",
          sectionLabel: "verse {label}"
        }
      )
    ).toBe(
      "Tonight's first repeat is :|: play that passage again at :| from the first verse {label}."
    );
    expect(fillRepeatCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
