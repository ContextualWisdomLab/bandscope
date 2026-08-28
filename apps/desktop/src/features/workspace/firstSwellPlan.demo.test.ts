import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstSwellPlan } from "./firstSwellPlan";

describe("resolveFirstSwellPlan demo topology", () => {
  it("keeps heuristic demo topology unnamed until real stem energy corroborates a swell", () => {
    expect(resolveFirstSwellPlan(createDemoRehearsalSong())).toBeNull();
  });
});
