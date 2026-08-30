import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillDcAlCodaCopy,
  firstDcAlCodaPlan,
  isTrustedDcAlCodaLabel,
  MAX_DC_AL_CODA_LABEL_LENGTH,
  trustedDcAlCoda
} from "./firstDcAlCoda";

describe("trustedDcAlCoda", () => {
  it("admits only own Gould/MusicXML D.C. al Coda and D.C. al Coda 1–9 labels", () => {
    expect(trustedDcAlCoda({ label: "D.C. al Coda" })).toEqual({ label: "D.C. al Coda" });
    expect(trustedDcAlCoda({ label: "D.C. al Coda 1" })).toEqual({ label: "D.C. al Coda 1" });
    expect(trustedDcAlCoda({ label: "D.C. al Coda 9" })).toEqual({ label: "D.C. al Coda 9" });
    const inherited = Object.create({ label: "D.C. al Coda" }) as Record<string, unknown>;
    expect(trustedDcAlCoda(inherited)).toBeNull();
    expect(trustedDcAlCoda({ label: "d.c. al coda" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C. Al Coda" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C. AL CODA" })).toBeNull();
    expect(trustedDcAlCoda({ label: " D.C. al Coda" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C. al Coda " })).toBeNull();
    expect(trustedDcAlCoda({ label: "Da Capo" })).toBeNull();
    expect(trustedDcAlCoda({ label: "Dal Segno" })).toBeNull();
    expect(trustedDcAlCoda({ label: "To Coda" })).toBeNull();
    expect(trustedDcAlCoda({ label: "Coda" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.S. al Coda" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.S. al Fine" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C. al Fine" })).toBeNull();
    expect(trustedDcAlCoda({ label: "al Coda" })).toBeNull();
    expect(trustedDcAlCoda({ label: "Fine" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.S." })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C." })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C. al Coda 0" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C. al Coda 10" })).toBeNull();
    expect(trustedDcAlCoda({ label: "" })).toBeNull();
    expect(trustedDcAlCoda({ label: "D.C. al Coda", extra: true })).toBeNull();
    expect(trustedDcAlCoda({ text: "D.C. al Coda" })).toBeNull();
    expect(trustedDcAlCoda(null)).toBeNull();
    expect(trustedDcAlCoda("D.C. al Coda")).toBeNull();
    expect(MAX_DC_AL_CODA_LABEL_LENGTH).toBe(14);
  });
});

describe("isTrustedDcAlCodaLabel", () => {
  it("rejects lowercase, sibling navigation, padded, and overlong tokens", () => {
    expect(isTrustedDcAlCodaLabel("D.C. al Coda")).toBe(true);
    expect(isTrustedDcAlCodaLabel("D.C. al Coda 2")).toBe(true);
    expect(isTrustedDcAlCodaLabel("d.c. al coda")).toBe(false);
    expect(isTrustedDcAlCodaLabel("D.C. al Coda 01")).toBe(false);
    expect(isTrustedDcAlCodaLabel("D.C. al Coda.")).toBe(false);
  });
});

describe("firstDcAlCodaPlan", () => {
  it("builds a D.C. al Coda plan without inventing beginning or coda destinations", () => {
    expect(firstDcAlCodaPlan(createDemoRehearsalSong())).toEqual({ label: "D.C. al Coda" });
  });

  it("ignores section order because the stored compound has no destination authority", () => {
    expect(
      firstDcAlCodaPlan({
        dcAlCoda: { label: "D.C. al Coda 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({ label: "D.C. al Coda 2" });
  });

  it("fails closed without a trusted D.C. al Coda", () => {
    const song = createDemoRehearsalSong();
    delete song.dcAlCoda;
    expect(firstDcAlCodaPlan(song)).toBeNull();
    expect(firstDcAlCodaPlan(undefined)).toBeNull();
    expect(firstDcAlCodaPlan([])).toBeNull();
  });
});

describe("fillDcAlCodaCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillDcAlCodaCopy("Tonight's first D.C. al Coda is {label}: return at {label}.", {
        label: "D.C. al Coda {label}"
      })
    ).toBe("Tonight's first D.C. al Coda is D.C. al Coda {label}: return at D.C. al Coda {label}.");
    expect(fillDcAlCodaCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
