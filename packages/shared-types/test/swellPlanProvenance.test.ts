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

  it.each(["", "   ", "swell here\nthen hold", "swell here\rthen hold"])(
    "rejects a swell plan source with blank or multiline copy %j",
    (swellPlan) => {
      const song = createDemoRehearsalSong();
      const role = song.sections[0]!.roles[0]!;
      role.swellPlan = swellPlan;
      role.swellPlanSource = "model";
      expect(() => parseRehearsalSong(song)).toThrow(/swellPlan/);
    }
  );
});
