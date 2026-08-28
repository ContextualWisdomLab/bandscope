import { createDemoRehearsalSong, parseRehearsalSong } from "../src/index";
import { describe, expect, it } from "vitest";

const DEMO_RITARDANDO_PLAN =
  "Ease this part from 120 BPM into 80 BPM; let the next downbeat land later.";

describe("ritardandoPlan provenance", () => {
  it.each(["model", "user"] as const)("admits a %s ritardando plan source", (source) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.ritardandoPlan = DEMO_RITARDANDO_PLAN;
    role.ritardandoPlanSource = source;
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.ritardandoPlanSource).toBe(source);
  });

  it("rejects an unknown ritardando plan source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.ritardandoPlan = DEMO_RITARDANDO_PLAN;
    role.ritardandoPlanSource = "inferred" as never;
    expect(() => parseRehearsalSong(song)).toThrow(/ritardandoPlanSource/);
  });

  it("rejects a ritardando plan source without copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    delete role.ritardandoPlan;
    role.ritardandoPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/ritardandoPlanSource/);
  });

  it("rejects ritardando plan copy without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.ritardandoPlan = DEMO_RITARDANDO_PLAN;
    delete role.ritardandoPlanSource;
    expect(() => parseRehearsalSong(song)).toThrow(/ritardandoPlanSource/);
  });

  it.each(["", "   ", "ease here\nthen hold", "ease here\rthen hold"])(
    "rejects a ritardando plan source with blank or multiline copy %j",
    (ritardandoPlan) => {
      const song = createDemoRehearsalSong();
      const role = song.sections[0]!.roles[0]!;
      role.ritardandoPlan = ritardandoPlan;
      role.ritardandoPlanSource = "model";
      expect(() => parseRehearsalSong(song)).toThrow(/ritardandoPlan/);
    }
  );
});
