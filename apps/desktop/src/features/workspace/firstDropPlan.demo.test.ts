import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstDropPlan } from "./firstDropPlan";

describe("resolveFirstDropPlan demo topology", () => {
  it("keeps heuristic demo topology unnamed until real stem activity corroborates a drop", () => {
    expect(resolveFirstDropPlan(createDemoRehearsalSong())).toBeNull();
  });
});
