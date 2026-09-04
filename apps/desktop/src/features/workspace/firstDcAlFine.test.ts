import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillDcAlFineCopy,
  firstDcAlFinePlan,
  isTrustedDcAlFineLabel,
  MAX_DC_AL_FINE_LABEL_LENGTH,
  trustedDcAlFine
} from "./firstDcAlFine";

describe("trustedDcAlFine", () => {
  it("admits only own Gould/MusicXML D.C. al Fine and D.C. al Fine 1–9 labels", () => {
    expect(trustedDcAlFine({ label: "D.C. al Fine" })).toEqual({ label: "D.C. al Fine" });
    expect(trustedDcAlFine({ label: "D.C. al Fine 1" })).toEqual({ label: "D.C. al Fine 1" });
    expect(trustedDcAlFine({ label: "D.C. al Fine 9" })).toEqual({ label: "D.C. al Fine 9" });
    const inherited = Object.create({ label: "D.C. al Fine" }) as Record<string, unknown>;
    expect(trustedDcAlFine(inherited)).toBeNull();
    expect(trustedDcAlFine({ label: "d.c. al fine" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C. Al Fine" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C. AL FINE" })).toBeNull();
    expect(trustedDcAlFine({ label: " D.C. al Fine" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C. al Fine " })).toBeNull();
    expect(trustedDcAlFine({ label: "Da Capo" })).toBeNull();
    expect(trustedDcAlFine({ label: "Dal Segno" })).toBeNull();
    expect(trustedDcAlFine({ label: "Fine" })).toBeNull();
    expect(trustedDcAlFine({ label: "To Coda" })).toBeNull();
    expect(trustedDcAlFine({ label: "Coda" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.S. al Coda" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C. al Coda" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.S. al Fine" })).toBeNull();
    expect(trustedDcAlFine({ label: "al Fine" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.S." })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C." })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C. al Fine 0" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C. al Fine 10" })).toBeNull();
    expect(trustedDcAlFine({ label: "" })).toBeNull();
    expect(trustedDcAlFine({ label: "D.C. al Fine", extra: true })).toBeNull();
    expect(trustedDcAlFine({ text: "D.C. al Fine" })).toBeNull();
    expect(trustedDcAlFine(null)).toBeNull();
    expect(trustedDcAlFine("D.C. al Fine")).toBeNull();
    expect(MAX_DC_AL_FINE_LABEL_LENGTH).toBe(14);
  });
});

describe("isTrustedDcAlFineLabel", () => {
  it("rejects lowercase, sibling navigation, padded, and overlong tokens", () => {
    expect(isTrustedDcAlFineLabel("D.C. al Fine")).toBe(true);
    expect(isTrustedDcAlFineLabel("D.C. al Fine 2")).toBe(true);
    expect(isTrustedDcAlFineLabel("d.c. al fine")).toBe(false);
    expect(isTrustedDcAlFineLabel("D.C. al Fine 01")).toBe(false);
    expect(isTrustedDcAlFineLabel("D.C. al Fine.")).toBe(false);
  });
});

describe("firstDcAlFinePlan", () => {
  it("builds a D.C. al Fine plan without inventing beginning or Fine destinations", () => {
    expect(firstDcAlFinePlan(createDemoRehearsalSong())).toEqual({ label: "D.C. al Fine" });
  });

  it("ignores section order because the stored compound has no destination authority", () => {
    expect(
      firstDcAlFinePlan({
        dcAlFine: { label: "D.C. al Fine 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({ label: "D.C. al Fine 2" });
  });

  it("fails closed without a trusted D.C. al Fine", () => {
    const song = createDemoRehearsalSong();
    delete song.dcAlFine;
    expect(firstDcAlFinePlan(song)).toBeNull();
    expect(firstDcAlFinePlan(undefined)).toBeNull();
    expect(firstDcAlFinePlan([])).toBeNull();
  });
});

describe("fillDcAlFineCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillDcAlFineCopy("Tonight's first D.C. al Fine is {label}: return at {label}.", {
        label: "D.C. al Fine {label}"
      })
    ).toBe("Tonight's first D.C. al Fine is D.C. al Fine {label}: return at D.C. al Fine {label}.");
    expect(fillDcAlFineCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
