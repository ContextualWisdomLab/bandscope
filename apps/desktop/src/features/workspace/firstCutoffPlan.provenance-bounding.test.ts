import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstCutoffPlan } from "./firstCutoffPlan";

describe("resolveFirstCutoffPlan provenance-aware bounding", () => {
  it("bounds a user-authored generated-shape plan verbatim instead of preserving the model sentence suffix", () => {
    const song = createDemoRehearsalSong();
    const bass = song.sections[0]!.roles.find((role) => role.id === "bass-guitar");
    expect(bass).toBeDefined();

    const customPlan = `Cut this off with ${"A".repeat(180)}; don't linger past the last beat.`;
    bass!.cutoffPlan = customPlan;
    bass!.cutoffPlanSource = "user";

    const resolved = resolveFirstCutoffPlan(song);
    expect(resolved?.cutoffPlanSource).toBe("user");
    expect(resolved?.cutoffPlan).toBe(Array.from(customPlan).slice(0, 180).join(""));
    expect(resolved?.cutoffPlan).not.toContain("don't linger past the last beat.");
  });
});
