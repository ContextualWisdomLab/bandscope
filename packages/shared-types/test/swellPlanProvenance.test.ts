import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

describe("swellPlan provenance", () => {
  it.each(["model", "user"] as const)("admits a %s swell plan source", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.swellPlan = "Swell this part; grow into the next downbeat.";
    role.swellPlanSource = source;
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.swellPlanSource).toBe(source);
  });

  it("rejects an unknown swell plan source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.swellPlan = "Swell this part; grow into the next downbeat.";
    role.swellPlanSource = "inferred" as never;
    expect(() => parseRehearsalSong(song)).toThrow(/swellPlanSource/);
  });

  it("rejects a swell plan source without copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.swellPlan;
    role.swellPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/swellPlanSource/);
  });

  it("rejects swell plan copy without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.swellPlan = "Swell this part; grow into the next downbeat.";
    delete role.swellPlanSource;
    expect(() => parseRehearsalSong(song)).toThrow(/swellPlanSource/);
  });

  it.each([
    "",
    "   ",
    "\u00a0\u2003\u3000",
    "swell here\nthen hold",
    "swell here\rthen hold",
    "swell here\u0085then hold",
    "swell here\u2028then hold",
    "swell here\u2029then hold"
  ])(
    "rejects a swell plan source with blank or multiline copy %j",
    (swellPlan) => {
      const song = createDemoRehearsalSong();
      const role = song.sections[0]!.roles[0]!;
      role.swellPlan = swellPlan;
      role.swellPlanSource = "model";
      expect(() => parseRehearsalSong(song)).toThrow(/swellPlan/);
    }
  );

  it("accepts padded single-line swell copy without normalizing it", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.swellPlan = "  Grow together. \u00a0";
    role.swellPlanSource = "user";

    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.swellPlan).toBe(role.swellPlan);
  });
});
