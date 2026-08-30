import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

describe("D.S. al Coda validation", () => {
  it("rejects an inherited label before structured cloning", () => {
    const inheritedDsAlCoda = Object.create({ label: "D.S. al Coda" }) as { label: string };
    const song = {
      ...createDemoRehearsalSong(),
      dsAlCoda: inheritedDsAlCoda
    };

    expect(() => parseRehearsalSong(song)).toThrow("dsAlCoda.label");
  });
});
