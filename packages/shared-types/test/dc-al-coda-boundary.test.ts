import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";

describe("D.C. al Coda boundary validation", () => {
  it("rejects inherited labels instead of accepting data that cloning can drop", () => {
    const inheritedMark = Object.create({ label: "D.C. al Coda" }) as { label: string };
    const song = {
      ...createDemoRehearsalSong(),
      dcAlCoda: inheritedMark
    };

    expect(() => parseRehearsalSong(song)).toThrow("dcAlCoda.label");
  });
});
