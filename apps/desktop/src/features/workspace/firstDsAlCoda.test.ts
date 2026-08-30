import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillDsAlCodaCopy,
  firstDsAlCodaPlan,
  isTrustedDsAlCodaLabel,
  MAX_DS_AL_CODA_LABEL_LENGTH,
  trustedDsAlCoda
} from "./firstDsAlCoda";

describe("trustedDsAlCoda", () => {
  it("admits only own Gould/MusicXML D.S. al Coda and D.S. al Coda 1–9 labels", () => {
    expect(trustedDsAlCoda({ label: "D.S. al Coda" })).toEqual({ label: "D.S. al Coda" });
    expect(trustedDsAlCoda({ label: "D.S. al Coda 1" })).toEqual({ label: "D.S. al Coda 1" });
    expect(trustedDsAlCoda({ label: "D.S. al Coda 9" })).toEqual({ label: "D.S. al Coda 9" });
    const inherited = Object.create({ label: "D.S. al Coda" }) as Record<string, unknown>;
    expect(trustedDsAlCoda(inherited)).toBeNull();
    expect(trustedDsAlCoda({ label: "d.s. al coda" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S. Al Coda" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S. AL CODA" })).toBeNull();
    expect(trustedDsAlCoda({ label: " D.S. al Coda" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S. al Coda " })).toBeNull();
    expect(trustedDsAlCoda({ label: "Dal Segno" })).toBeNull();
    expect(trustedDsAlCoda({ label: "To Coda" })).toBeNull();
    expect(trustedDsAlCoda({ label: "Coda" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.C. al Coda" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S. al Fine" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.C. al Fine" })).toBeNull();
    expect(trustedDsAlCoda({ label: "al Coda" })).toBeNull();
    expect(trustedDsAlCoda({ label: "Fine" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S." })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.C." })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S. al Coda 0" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S. al Coda 10" })).toBeNull();
    expect(trustedDsAlCoda({ label: "" })).toBeNull();
    expect(trustedDsAlCoda({ label: "D.S. al Coda", extra: true })).toBeNull();
    expect(trustedDsAlCoda({ text: "D.S. al Coda" })).toBeNull();
    expect(trustedDsAlCoda(null)).toBeNull();
    expect(trustedDsAlCoda("D.S. al Coda")).toBeNull();
    expect(MAX_DS_AL_CODA_LABEL_LENGTH).toBe(14);
  });
});

describe("isTrustedDsAlCodaLabel", () => {
  it("rejects lowercase, sibling navigation, padded, and overlong tokens", () => {
    expect(isTrustedDsAlCodaLabel("D.S. al Coda")).toBe(true);
    expect(isTrustedDsAlCodaLabel("D.S. al Coda 2")).toBe(true);
    expect(isTrustedDsAlCodaLabel("d.s. al coda")).toBe(false);
    expect(isTrustedDsAlCodaLabel("D.S. al Coda 01")).toBe(false);
    expect(isTrustedDsAlCodaLabel("D.S. al Coda.")).toBe(false);
  });
});

describe("firstDsAlCodaPlan", () => {
  it("builds a D.S. al Coda plan without inventing segno or coda destinations", () => {
    expect(firstDsAlCodaPlan(createDemoRehearsalSong())).toEqual({ label: "D.S. al Coda" });
  });

  it("ignores section order because the stored compound has no destination authority", () => {
    expect(
      firstDsAlCodaPlan({
        dsAlCoda: { label: "D.S. al Coda 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({ label: "D.S. al Coda 2" });
  });

  it("fails closed without a trusted D.S. al Coda", () => {
    const song = createDemoRehearsalSong();
    delete song.dsAlCoda;
    expect(firstDsAlCodaPlan(song)).toBeNull();
    expect(firstDsAlCodaPlan(undefined)).toBeNull();
    expect(firstDsAlCodaPlan([])).toBeNull();
  });
});

describe("fillDsAlCodaCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillDsAlCodaCopy("Tonight's first D.S. al Coda is {label}: return at {label}.", {
        label: "D.S. al Coda {label}"
      })
    ).toBe("Tonight's first D.S. al Coda is D.S. al Coda {label}: return at D.S. al Coda {label}.");
    expect(fillDsAlCodaCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
