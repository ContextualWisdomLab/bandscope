import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

describe("breakdownPlan provenance", () => {
  it.each(["model", "user"] as const)("admits a %s breakdown plan source", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.breakdownPlan = "Hold this breakdown; keep it sparse until the drop.";
    role.breakdownPlanSource = source;
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.breakdownPlanSource).toBe(source);
  });

  it("rejects an unknown breakdown plan source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.breakdownPlan = "Hold this breakdown; keep it sparse until the drop.";
    role.breakdownPlanSource = "inferred" as never;
    expect(() => parseRehearsalSong(song)).toThrow(/breakdownPlanSource/);
  });

  it("rejects a breakdown plan source without copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.breakdownPlan;
    role.breakdownPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/breakdownPlanSource/);
  });
});
