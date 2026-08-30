import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  fillToCodaCopy,
  firstToCodaPlan,
  isTrustedToCodaLabel,
  MAX_TO_CODA_LABEL_LENGTH,
  trustedToCoda
} from "./firstToCoda";

describe("trustedToCoda", () => {
  it("admits only own Gould/MusicXML To Coda and To Coda 1–9 labels", () => {
    expect(trustedToCoda({ label: "To Coda" })).toEqual({ label: "To Coda" });
    expect(trustedToCoda({ label: "To Coda 1" })).toEqual({ label: "To Coda 1" });
    expect(trustedToCoda({ label: "To Coda 9" })).toEqual({ label: "To Coda 9" });
    const inherited = Object.create({ label: "To Coda" }) as Record<string, unknown>;
    expect(trustedToCoda(inherited)).toBeNull();
    expect(trustedToCoda({ label: "to coda" })).toBeNull();
    expect(trustedToCoda({ label: "To coda" })).toBeNull();
    expect(trustedToCoda({ label: "TO CODA" })).toBeNull();
    expect(trustedToCoda({ label: " To Coda" })).toBeNull();
    expect(trustedToCoda({ label: "To Coda " })).toBeNull();
    expect(trustedToCoda({ label: "Coda" })).toBeNull();
    expect(trustedToCoda({ label: "D.S. al Coda" })).toBeNull();
    expect(trustedToCoda({ label: "D.C. al Coda" })).toBeNull();
    expect(trustedToCoda({ label: "al Coda" })).toBeNull();
    expect(trustedToCoda({ label: "Fine" })).toBeNull();
    expect(trustedToCoda({ label: "D.S." })).toBeNull();
    expect(trustedToCoda({ label: "To Coda 0" })).toBeNull();
    expect(trustedToCoda({ label: "To Coda 10" })).toBeNull();
    expect(trustedToCoda({ label: "" })).toBeNull();
    expect(trustedToCoda({ label: "To Coda", extra: true })).toBeNull();
    expect(trustedToCoda({ text: "To Coda" })).toBeNull();
    expect(trustedToCoda(null)).toBeNull();
    expect(trustedToCoda("To Coda")).toBeNull();
    expect(MAX_TO_CODA_LABEL_LENGTH).toBe(9);
  });
});

describe("isTrustedToCodaLabel", () => {
  it("rejects lowercase, coda destination, padded, and overlong tokens", () => {
    expect(isTrustedToCodaLabel("To Coda")).toBe(true);
    expect(isTrustedToCodaLabel("To Coda 2")).toBe(true);
    expect(isTrustedToCodaLabel("to coda")).toBe(false);
    expect(isTrustedToCodaLabel("To Coda 01")).toBe(false);
    expect(isTrustedToCodaLabel("To Coda.")).toBe(false);
  });
});

describe("firstToCodaPlan", () => {
  it("builds a To Coda jump plan without inventing a destination section", () => {
    expect(firstToCodaPlan(createDemoRehearsalSong())).toEqual({ label: "To Coda" });
  });

  it("ignores section order because the stored jump mark has no destination authority", () => {
    expect(
      firstToCodaPlan({
        toCoda: { label: "To Coda 2" },
        sections: [{ label: "intro" }, { label: "bridge" }, { label: "outro" }]
      })
    ).toEqual({ label: "To Coda 2" });
  });

  it("fails closed without a trusted To Coda", () => {
    const song = createDemoRehearsalSong();
    delete song.toCoda;
    expect(firstToCodaPlan(song)).toBeNull();
    expect(firstToCodaPlan(undefined)).toBeNull();
    expect(firstToCodaPlan([])).toBeNull();
  });
});

describe("fillToCodaCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillToCodaCopy("Tonight's first To Coda is {label}: jump at {label}.", {
        label: "To Coda {label}"
      })
    ).toBe("Tonight's first To Coda is To Coda {label}: jump at To Coda {label}.");
    expect(fillToCodaCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
