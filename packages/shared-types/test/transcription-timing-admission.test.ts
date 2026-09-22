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

const transcriptionTimingPath = "sections[0].roles[0].transcription[0]";

describe("transcription timing admission", () => {
  for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    it(`rejects non-finite onset ${String(nonFinite)}`, () => {
      const song = songWithTiming(nonFinite, 1);

      expect(isRehearsalSong(song)).toBe(false);
      expect(() => parseRehearsalSong(song)).toThrow(`${transcriptionTimingPath}.onset`);
    });

    it(`rejects non-finite offset ${String(nonFinite)}`, () => {
      const song = songWithTiming(0, nonFinite);

      expect(isRehearsalSong(song)).toBe(false);
      expect(() => parseRehearsalSong(song)).toThrow(`${transcriptionTimingPath}.offset`);
    });
  }

  it.each([
    ["negative onset", -0.001, 0.5, "onset"],
    ["zero-duration interval", 0.5, 0.5, "offset"],
    ["inverted interval", 1, 0.5, "offset"]
  ] as const)("rejects %s", (_label, onset, offset, field) => {
    const song = songWithTiming(onset, offset);

    expect(isRehearsalSong(song)).toBe(false);
    expect(() => parseRehearsalSong(song)).toThrow(`${transcriptionTimingPath}.${field}`);
  });

  it("accepts zero and negative-zero onset with positive duration", () => {
    for (const onset of [0, -0]) {
      const song = songWithTiming(onset, 0.25);

      expect(isRehearsalSong(song)).toBe(true);
      expect(parseRehearsalSong(song)).toEqual(song);
    }
  });

  it("accepts ordinary positive audio-relative intervals", () => {
    const song = songWithTiming(2, 2.125);

    expect(isRehearsalSong(song)).toBe(true);
    expect(parseRehearsalSong(song)).toEqual(song);
  });
});
