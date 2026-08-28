import { createDemoRehearsalSong, isRehearsalSong, parseRehearsalSong } from "../src/index";

describe("vamp plan provenance contract", () => {
  it.each(["model", "user"] as const)("preserves explicit %s provenance", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.vampPlan = "Keep this part going until Lead Vocal enters in the next section.";
    role.vampPlanSource = source;

    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.vampPlanSource).toBe(source);
  });

  it("rejects a vamp plan without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.vampPlanSource;

    expect(isRehearsalSong(song)).toBe(false);
    expect(() => parseRehearsalSong(song)).toThrow(/vampPlanSource/);
  });

  it("rejects unsupported provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]! as typeof song.sections[0]["roles"][number] & {
      vampPlanSource: string;
    };
    role.vampPlanSource = "external";

    expect(isRehearsalSong(song)).toBe(false);
    expect(() => parseRehearsalSong(song)).toThrow(/vampPlanSource/);
  });
});
