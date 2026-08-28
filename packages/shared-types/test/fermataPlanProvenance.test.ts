import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

const DEMO_FERMATA_PLAN =
  "Hold this part through the extra 1 s; wait for the cutoff before the next entrance.";

describe("fermataPlan provenance", () => {
  it.each(["model", "user"] as const)("admits a %s fermata plan source", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.fermataPlan = DEMO_FERMATA_PLAN;
    role.fermataPlanSource = source;
    role.fermataPlanAtSeconds = 11.25;
    const parsed = parseRehearsalSong(song).sections[0]!.roles[0]!;
    expect(parsed.fermataPlanSource).toBe(source);
    expect(parsed.fermataPlanAtSeconds).toBe(11.25);
  });

  it("rejects an unknown fermata plan source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.fermataPlan = DEMO_FERMATA_PLAN;
    role.fermataPlanSource = "inferred" as never;
    expect(() => parseRehearsalSong(song)).toThrow(/fermataPlanSource/);
  });

  it("rejects an fermata plan source without copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.fermataPlan;
    role.fermataPlanSource = "model";
    role.fermataPlanAtSeconds = 11.25;
    expect(() => parseRehearsalSong(song)).toThrow(/fermataPlanSource/);
  });

  it("rejects fermata plan copy without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.fermataPlan = DEMO_FERMATA_PLAN;
    delete role.fermataPlanSource;
    expect(() => parseRehearsalSong(song)).toThrow(/fermataPlanSource/);
  });

  it.each(["", "   ", "push here\nthen hold", "push here\rthen hold"])(
    "rejects an fermata plan source with blank or multiline copy %j",
    (fermataPlan) => {
      const song = createDemoRehearsalSong();
      const role = song.sections[0]!.roles[0]!;
      role.fermataPlan = fermataPlan;
      role.fermataPlanSource = "model";
      expect(() => parseRehearsalSong(song)).toThrow(/fermataPlan/);
    }
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, "11"])(
    "rejects an invalid fermata plan timestamp %j",
    (atSeconds) => {
      const song = createDemoRehearsalSong();
      const role = song.sections[0]!.roles[0]!;
      role.fermataPlan = DEMO_FERMATA_PLAN;
      role.fermataPlanSource = "model";
      role.fermataPlanAtSeconds = atSeconds as never;
      expect(() => parseRehearsalSong(song)).toThrow(/fermataPlanAtSeconds/);
    }
  );
});
