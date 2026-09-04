import { createDemoRehearsalSong, isRehearsalSong, parseRehearsalSong } from "../src/index";

describe("hit plan provenance contract", () => {
  it.each(["model", "user"] as const)("preserves explicit %s provenance", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.hitPlan = "Land this hit with Lead Vocal; don't drift past the downbeat.";
    role.hitPlanSource = source;

    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.hitPlanSource).toBe(source);
  });

  it("rejects a hit plan without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.hitPlanSource;

    expect(isRehearsalSong(song)).toBe(false);
    expect(() => parseRehearsalSong(song)).toThrow(/hitPlanSource/);
  });

  it("rejects unsupported provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]! as typeof song.sections[0]["roles"][number] & {
      hitPlanSource: string;
    };
    role.hitPlanSource = "external";

    expect(isRehearsalSong(song)).toBe(false);
    expect(() => parseRehearsalSong(song)).toThrow(/hitPlanSource/);
  });
});
