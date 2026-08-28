import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstFadePlan } from "./firstFadePlan";

describe("resolveFirstFadePlan demo topology", () => {
  it("keeps heuristic demo topology unnamed until real stem energy corroborates a fade", () => {
    expect(resolveFirstFadePlan(createDemoRehearsalSong())).toBeNull();
  });
});
