import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";

describe("turnaround plan provenance", () => {
  it.each(["model", "user"] as const)("preserves explicit %s provenance", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.turnaroundPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    role.turnaroundPlanSource = source;

    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.turnaroundPlanSource).toBe(source);
  });

  it("rejects unsupported provenance values", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]! as unknown as Record<string, unknown>;
    role.turnaroundPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    role.turnaroundPlanSource = "inferred";

    expect(() => parseRehearsalSong(song)).toThrow(/turnaroundPlanSource/);
  });

  it("rejects provenance without a turnaround plan", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.turnaroundPlan;
    role.turnaroundPlanSource = "model";

    expect(() => parseRehearsalSong(song)).toThrow(/turnaroundPlanSource/);
  });

  it("rejects a turnaround plan without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.turnaroundPlan = "Turn these last bars with Lead Vocal; land the downbeat together.";
    delete role.turnaroundPlanSource;

    expect(() => parseRehearsalSong(song)).toThrow(/turnaroundPlanSource/);
  });
});
