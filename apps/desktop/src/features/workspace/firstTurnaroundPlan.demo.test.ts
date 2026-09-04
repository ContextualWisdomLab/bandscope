import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

describe("demo turnaround plan", () => {
  it("keeps the demo turnaround actionable across a real successor section", () => {
    expect(resolveFirstTurnaroundPlan(createDemoRehearsalSong())).toMatchObject({
      sectionId: "verse-1",
      landingRoleId: "bass-guitar",
      atSeconds: 30
    });
  });
});
