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

  it("rejects a breakdown plan without source", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.breakdownPlan = "Hold this breakdown; keep it sparse until the drop.";
    delete role.breakdownPlanSource;
    expect(() => parseRehearsalSong(song)).toThrow(/breakdownPlanSource/);
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
    "hold\nthen drop",
    "hold\rthen drop",
    "hold\u0085then drop",
    "hold\u2028then drop",
    "hold\u2029then drop"
  ])("rejects invalid breakdown-plan copy %j", (breakdownPlan) => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.breakdownPlan = breakdownPlan;
    role.breakdownPlanSource = "model";
    expect(() => parseRehearsalSong(song)).toThrow(/breakdownPlan/);
  });

  it("accepts Unicode-padded single-line breakdown-plan copy", () => {
    const song = createDemoRehearsalSong();
    const role = song.sections[0]!.roles[0]!;
    role.breakdownPlan = "\uFEFF Hold this breakdown; keep it sparse until the drop.\u3000";
    role.breakdownPlanSource = "model";
    expect(parseRehearsalSong(song).sections[0]!.roles[0]!.breakdownPlan).toContain(
      "Hold this breakdown"
    );
  });
});
