import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

describe("fadePlan provenance", () => {
  it.each(["model", "user"] as const)("admits a %s fade plan source", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.fadePlan = "Fade this part; let the next downbeat land quieter.";
    role.fadePlanSource = source;
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.fadePlanSource).toBe(source);
  });

  it("rejects an unknown fade plan source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.fadePlan = "Fade this part; let the next downbeat land quieter.";
    role.fadePlanSource = "inferred" as never;
    expect(() => parseRehearsalSong(song)).toThrow(/fadePlanSource/);
  });

  it("rejects a fade plan source without copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.fadePlan;
    role.fadePlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/fadePlanSource/);
  });

  it.each(["", "   ", "fade here\nthen hold", "fade here\rthen hold"])(
    "rejects a fade plan source with blank or multiline copy %j",
    (fadePlan) => {
      const song = createDemoRehearsalSong();
      const role = song.sections[0]!.roles[0]!;
      role.fadePlan = fadePlan;
      role.fadePlanSource = "model";
      expect(() => parseRehearsalSong(song)).toThrow(/fadePlan/);
    }
  );
});
