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

  it("rejects a pickup plan without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.pickupPlan = "Play this pickup with Lead Vocal; land the downbeat together.";
    delete role.pickupPlanSource;

    expect(() => parseRehearsalSong(song)).toThrow(/pickupPlanSource/);
  });

  it.each([
    "",
    " \t ",
    "\u0009",
    "\u000b",
    "\u000c",
    "\u000d",
    "\u0085",
    "\u00a0",
    "\u1680",
    "\u2000",
    "\u200a",
    "\u2028",
    "\u2029",
    "\u202f",
    "\u205f",
    "\u3000",
    "\ufeff",
    "first line\nsecond line",
    "first line\rsecond line",
    "first line\u0085second line",
    "first line\u2028second line",
    "first line\u2029second line"
  ])("rejects blank or multi-line persisted pickup plans: %j", (pickupPlan) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.pickupPlan = pickupPlan;
    role.pickupPlanSource = "model";

    expect(() => parseRehearsalSong(song)).toThrow(/pickupPlan/);
  });

  it("accepts Unicode-padded single-line pickup plans", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.pickupPlan = "\ufeff Land the downbeat \u3000";
    role.pickupPlanSource = "model";

    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.pickupPlan).toBe(role.pickupPlan);
  });
});
