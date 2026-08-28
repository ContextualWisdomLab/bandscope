import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

const DEMO_ACCELERANDO_PLAN =
  "Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner.";

describe("accelerandoPlan provenance", () => {
  it.each(["model", "user"] as const)("admits a %s accelerando plan source", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlan = DEMO_ACCELERANDO_PLAN;
    role.accelerandoPlanSource = source;
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.accelerandoPlanSource).toBe(source);
  });

  it("rejects an unknown accelerando plan source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlan = DEMO_ACCELERANDO_PLAN;
    role.accelerandoPlanSource = "inferred" as never;
    expect(() => parseRehearsalSong(song)).toThrow(/accelerandoPlanSource/);
  });

  it("rejects an accelerando plan source without copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.accelerandoPlan;
    role.accelerandoPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/accelerandoPlanSource/);
  });

  it("rejects accelerando plan copy without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlan = DEMO_ACCELERANDO_PLAN;
    delete role.accelerandoPlanSource;
    expect(() => parseRehearsalSong(song)).toThrow(/accelerandoPlanSource/);
  });

  it.each(["", "   ", "push here\nthen hold", "push here\rthen hold"])(
    "rejects an accelerando plan source with blank or multiline copy %j",
    (accelerandoPlan) => {
      const song = createDemoRehearsalSong();
      const role = song.sections[0]!.roles[0]!;
      role.accelerandoPlan = accelerandoPlan;
      role.accelerandoPlanSource = "model";
      expect(() => parseRehearsalSong(song)).toThrow(/accelerandoPlan/);
    }
  );
});
