import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";

describe("pickup plan provenance", () => {
  it.each(["model", "user"] as const)("preserves explicit %s provenance", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.pickupPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    role.pickupPlanSource = source;

    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.pickupPlanSource).toBe(source);
  });

  it("rejects unsupported provenance values", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]! as unknown as Record<string, unknown>;
    role.pickupPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    role.pickupPlanSource = "inferred";

    expect(() => parseRehearsalSong(song)).toThrow(/pickupPlanSource/);
  });

  it("rejects provenance without a pickup plan", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.pickupPlan;
    role.pickupPlanSource = "model";

    expect(() => parseRehearsalSong(song)).toThrow(/pickupPlanSource/);
  });
});
