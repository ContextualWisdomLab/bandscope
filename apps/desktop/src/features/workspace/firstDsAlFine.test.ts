import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillDsAlFineCopy,
  firstDsAlFinePlan,
  isTrustedDsAlFineLabel,
  MAX_DS_AL_FINE_LABEL_LENGTH,
  trustedDsAlFine
} from "./firstDsAlFine";

describe("trustedDsAlFine", () => {
  it("admits only own Gould/MusicXML D.S. al Fine and D.S. al Fine 1–9 labels", () => {
    expect(trustedDsAlFine({ label: "D.S. al Fine" })).toEqual({ label: "D.S. al Fine" });
    expect(trustedDsAlFine({ label: "D.S. al Fine 1" })).toEqual({ label: "D.S. al Fine 1" });
    expect(trustedDsAlFine({ label: "D.S. al Fine 9" })).toEqual({ label: "D.S. al Fine 9" });
    const inherited = Object.create({ label: "D.S. al Fine" }) as Record<string, unknown>;
    expect(trustedDsAlFine(inherited)).toBeNull();
    expect(trustedDsAlFine({ label: "d.s. al fine" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S. Al Fine" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S. AL FINE" })).toBeNull();
    expect(trustedDsAlFine({ label: " D.S. al Fine" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S. al Fine " })).toBeNull();
    expect(trustedDsAlFine({ label: "Dal Segno" })).toBeNull();
    expect(trustedDsAlFine({ label: "Fine" })).toBeNull();
    expect(trustedDsAlFine({ label: "To Coda" })).toBeNull();
    expect(trustedDsAlFine({ label: "Coda" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S. al Coda" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.C. al Coda" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.C. al Fine" })).toBeNull();
    expect(trustedDsAlFine({ label: "al Fine" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S." })).toBeNull();
    expect(trustedDsAlFine({ label: "D.C." })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S. al Fine 0" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S. al Fine 10" })).toBeNull();
    expect(trustedDsAlFine({ label: "" })).toBeNull();
    expect(trustedDsAlFine({ label: "D.S. al Fine", extra: true })).toBeNull();
    expect(trustedDsAlFine({ text: "D.S. al Fine" })).toBeNull();
    expect(trustedDsAlFine(null)).toBeNull();
    expect(trustedDsAlFine("D.S. al Fine")).toBeNull();
    expect(MAX_DS_AL_FINE_LABEL_LENGTH).toBe(14);
  });
});

describe("isTrustedDsAlFineLabel", () => {
  it("rejects lowercase, sibling navigation, padded, and overlong tokens", () => {
    expect(isTrustedDsAlFineLabel("D.S. al Fine")).toBe(true);
    expect(isTrustedDsAlFineLabel("D.S. al Fine 2")).toBe(true);
    expect(isTrustedDsAlFineLabel("d.s. al fine")).toBe(false);
    expect(isTrustedDsAlFineLabel("D.S. al Fine 01")).toBe(false);
    expect(isTrustedDsAlFineLabel("D.S. al Fine.")).toBe(false);
  });
});

describe("firstDsAlFinePlan", () => {
  it("builds a D.S. al Fine plan without inventing segno or Fine destinations", () => {
    expect(firstDsAlFinePlan(createDemoRehearsalSong())).toEqual({ label: "D.S. al Fine" });
  });

  it("ignores section order because the stored compound has no destination authority", () => {
    expect(
      firstDsAlFinePlan({
        dsAlFine: { label: "D.S. al Fine 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({ label: "D.S. al Fine 2" });
  });

  it("fails closed without a trusted D.S. al Fine", () => {
    const song = createDemoRehearsalSong();
    delete song.dsAlFine;
    expect(firstDsAlFinePlan(song)).toBeNull();
    expect(firstDsAlFinePlan(undefined)).toBeNull();
    expect(firstDsAlFinePlan([])).toBeNull();
  });
});

describe("fillDsAlFineCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillDsAlFineCopy("Tonight's first D.S. al Fine is {label}: return at {label}.", {
        label: "D.S. al Fine {label}"
      })
    ).toBe("Tonight's first D.S. al Fine is D.S. al Fine {label}: return at D.S. al Fine {label}.");
    expect(fillDsAlFineCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
