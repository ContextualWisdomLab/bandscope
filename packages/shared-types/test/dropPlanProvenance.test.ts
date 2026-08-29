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

  it("rejects drop plan copy without provenance", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.dropPlan = "Hit this drop; come in together when the texture fills.";
    delete role.dropPlanSource;
    expect(() => parseRehearsalSong(song)).toThrow(/dropPlanSource/);
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
    "land here\nthen hold",
    "land here\rthen hold",
    "land here\u0085then hold",
    "land here\u2028then hold",
    "land here\u2029then hold"
  ])("rejects invalid drop-plan copy %j", (dropPlan) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.dropPlan = dropPlan;
    role.dropPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/dropPlan/);
  });

  it("accepts Unicode-padded single-line drop-plan copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.dropPlan = "\uFEFF Hit this drop; come in together when the texture fills.\u3000";
    role.dropPlanSource = "model";
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.dropPlan).toContain("Hit this drop");
  });
});
