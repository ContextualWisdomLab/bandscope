import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

describe("dropPlan provenance", () => {
  it.each(["model", "user"] as const)("admits a %s drop plan source", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.dropPlan = "Hit this drop; come in together when the texture fills.";
    role.dropPlanSource = source;
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.dropPlanSource).toBe(source);
  });

  it("rejects an unknown drop plan source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.dropPlan = "Hit this drop; come in together when the texture fills.";
    role.dropPlanSource = "inferred" as never;
    expect(() => parseRehearsalSong(song)).toThrow(/dropPlanSource/);
  });

  it("rejects a drop plan source without copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.dropPlan;
    role.dropPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/dropPlanSource/);
  });

  it.each(["", "   "])("rejects a drop plan source with blank copy %j", (dropPlan) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.dropPlan = dropPlan;
    role.dropPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/dropPlan/);
  });
});
