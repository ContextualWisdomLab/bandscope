import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstHitPlan } from "./firstHitPlan";

describe("resolveFirstHitPlan user-authored copy", () => {
  it("preserves user-authored generated-shaped guidance verbatim", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const role = section?.roles.find((candidate) => candidate.id === "bass-guitar");
    expect(role).toBeDefined();
    if (!role) {
      throw new Error("Demo hit-plan fixture is missing the expected Bass Guitar role.");
    }

    const userCopy = "  Land this hit with Accompaniment; don't drift past the downbeat.  ";
    role.hitPlan = userCopy;
    role.hitPlanSource = "user";

    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.hitPlanSource).toBe("user");
    expect(resolved?.hitPlan).toBe(userCopy);
  });
});
