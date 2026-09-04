import {
  createDemoRehearsalSong,
  isRehearsalSong,
  parseRehearsalSong,
  type RehearsalSong
} from "../src/index";

describe("cutoff plan provenance contract", () => {
  it("round-trips explicit model and user provenance and rejects legacy absence", () => {
    for (const source of ["model", "user"] as const) {
      const song = createDemoRehearsalSong();
      song.sections[0]!.roles[0]!.cutoffPlanSource = source;

      expect(isRehearsalSong(song)).toBe(true);
      expect(parseRehearsalSong(song).sections[0]!.roles[0]!.cutoffPlanSource).toBe(source);
    }

    const legacySong = createDemoRehearsalSong();
    delete legacySong.sections[0]!.roles[0]!.cutoffPlanSource;
    expect(isRehearsalSong(legacySong)).toBe(false);
    expect(() => parseRehearsalSong(legacySong)).toThrow("sections[0].roles[0].cutoffPlanSource");
  });

  it("fails closed on unknown cutoff plan provenance", () => {
    const song = createDemoRehearsalSong() as RehearsalSong;
    (song.sections[0]!.roles[0] as unknown as Record<string, unknown>).cutoffPlanSource = "external";

    expect(isRehearsalSong(song)).toBe(false);
    expect(() => parseRehearsalSong(song)).toThrow("sections[0].roles[0].cutoffPlanSource");
  });
});
