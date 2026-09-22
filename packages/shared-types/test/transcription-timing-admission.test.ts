import {
  createDemoRehearsalSong,
  isRehearsalSong,
  parseRehearsalSong,
  type RehearsalSong
} from "../src/index";

function songWithTiming(onset: number, offset: number): RehearsalSong {
  const song = createDemoRehearsalSong();
  song.sections[0]!.roles[0]!.transcription = [
    { pitch: "E2", onset, offset, velocity: 0.7 }
  ];
  return song;
}

describe("transcription timing admission", () => {
  for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    it(`rejects non-finite onset ${String(nonFinite)}`, () => {
      const song = songWithTiming(nonFinite, 1);

      expect(isRehearsalSong(song)).toBe(false);
      expect(() => parseRehearsalSong(song)).toThrow(
        "sections[0].roles[0].transcription[0].onset"
      );
    });

    it(`rejects non-finite offset ${String(nonFinite)}`, () => {
      const song = songWithTiming(0, nonFinite);

      expect(isRehearsalSong(song)).toBe(false);
      expect(() => parseRehearsalSong(song)).toThrow(
        "sections[0].roles[0].transcription[0].offset"
      );
    });
  }

  it("preserves the existing finite timing domain", () => {
    const finiteCases = [
      songWithTiming(0, 1),
      songWithTiming(-1, -0.5),
      songWithTiming(2, 1)
    ];

    for (const song of finiteCases) {
      expect(isRehearsalSong(song)).toBe(true);
      expect(parseRehearsalSong(song)).toEqual(song);
    }
  });
});
