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

  it("round-trips the precise tempo-change time", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlan = DEMO_ACCELERANDO_PLAN;
    role.accelerandoPlanSource = "model";
    role.accelerandoPlanAtSeconds = 12.375;
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.accelerandoPlanAtSeconds).toBe(12.375);
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

  it.each([Number.NaN, -1, 4_294_967_296])("rejects invalid accelerando-plan timing %s", (time) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlan = DEMO_ACCELERANDO_PLAN;
    role.accelerandoPlanSource = "model";
    role.accelerandoPlanAtSeconds = time;
    expect(() => parseRehearsalSong(song)).toThrow(/accelerandoPlanAtSeconds/);
  });

  it("rejects accelerando-plan timing without its plan copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlanAtSeconds = 12.375;
    expect(() => parseRehearsalSong(song)).toThrow(/accelerandoPlanAtSeconds/);
  });

  it.each([
    "",
    "   ",
    "\u0009",
    "\u000B",
    "\u000C",
    "\u000D",
    "\u0085",
    "\u00A0",
    "\u1680",
    "\u2000",
    "\u200A",
    "\u2028",
    "\u2029",
    "\u202F",
    "\u205F",
    "\u3000",
    "\uFEFF",
    "push here\nthen hold",
    "push here\rthen hold",
    "push here\u0085then hold",
    "push here\u2028then hold",
    "push here\u2029then hold"
  ])("rejects invalid accelerando-plan copy %j", (accelerandoPlan) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlan = accelerandoPlan;
    role.accelerandoPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/accelerandoPlan/);
  });

  it("accepts Unicode-padded single-line accelerando-plan copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.accelerandoPlan = `\uFEFF ${DEMO_ACCELERANDO_PLAN} \u3000`;
    role.accelerandoPlanSource = "model";
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.accelerandoPlan).toContain(
      "Push this part"
    );
  });
});
