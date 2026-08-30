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

  it("keeps bounded user guidance visible after a long leading-whitespace prefix", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const role = section?.roles.find((candidate) => candidate.id === "bass-guitar");
    expect(role).toBeDefined();
    if (!role) {
      throw new Error("Demo hit-plan fixture is missing the expected Bass Guitar role.");
    }

    const guidance = "Hit the downbeat together.";
    const userCopy = `${" ".repeat(180)}${guidance}`;
    role.hitPlan = userCopy;
    role.hitPlanSource = "user";

    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.hitPlanSource).toBe("user");
    expect(resolved?.hitPlan).toBe(guidance);
    expect(role.hitPlan).toBe(userCopy);
  });

  it("does not let near-limit indentation crowd out the instruction", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const role = section?.roles.find((candidate) => candidate.id === "bass-guitar");
    expect(role).toBeDefined();
    if (!role) {
      throw new Error("Demo hit-plan fixture is missing the expected Bass Guitar role.");
    }

    const guidance = "Hit the downbeat together.";
    const userCopy = `${" ".repeat(179)}${guidance}`;
    role.hitPlan = userCopy;
    role.hitPlanSource = "user";

    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.hitPlanSource).toBe("user");
    expect(resolved?.hitPlan).toBe(guidance);
    expect(role.hitPlan).toBe(userCopy);
  });

  it("does not let non-collapsing unicode indentation hide the instruction", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const role = section?.roles.find((candidate) => candidate.id === "bass-guitar");
    expect(role).toBeDefined();
    if (!role) {
      throw new Error("Demo hit-plan fixture is missing the expected Bass Guitar role.");
    }

    const guidance = "Hit on beat one.";
    const userCopy = `${"\u00a0".repeat(164)}${guidance}${" stay together".repeat(4)}`;
    role.hitPlan = userCopy;
    role.hitPlanSource = "user";

    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.hitPlanSource).toBe("user");
    expect(resolved?.hitPlan.startsWith(guidance)).toBe(true);
    expect(resolved?.hitPlan.startsWith("\u00a0")).toBe(false);
    expect(Array.from(resolved?.hitPlan ?? "").length).toBeLessThanOrEqual(180);
    expect(role.hitPlan).toBe(userCopy);
  });

  it("preserves ordinary leading whitespace when visible guidance fits the bound", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections.find((candidate) => candidate.id === "verse-1");
    const role = section?.roles.find((candidate) => candidate.id === "bass-guitar");
    expect(role).toBeDefined();
    if (!role) {
      throw new Error("Demo hit-plan fixture is missing the expected Bass Guitar role.");
    }

    const guidance = "Hit the downbeat together.";
    const userCopy = `  ${guidance}${" Keep the rest of the band aligned.".repeat(8)}`;
    role.hitPlan = userCopy;
    role.hitPlanSource = "user";

    const resolved = resolveFirstHitPlan(song);
    expect(resolved?.hitPlan.startsWith(`  ${guidance}`)).toBe(true);
    expect(Array.from(resolved?.hitPlan ?? "")).toHaveLength(180);
  });
});
