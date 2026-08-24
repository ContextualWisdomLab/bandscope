import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstEarCheck } from "./firstEarCheck";

describe("resolveFirstEarCheck inactive-role hint ownership", () => {
  it("does not surface notes owned only by an inactive role in a band-wide ear check", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const role = section.roles[0]!;

    section.confidence = {
      level: "high",
      source: "model",
      notes: "Section is not uncertain."
    };
    role.confidence = {
      level: "medium",
      source: "model",
      notes: "Inactive role note must not become band-wide guidance."
    };
    section.roles = [role];
    section.partGraph = [
      {
        role_id: role.id,
        is_active: false,
        handoff_to: [],
        handoff_from: []
      }
    ];
    song.sections = [section];

    const resolved = resolveFirstEarCheck(song);

    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("");
  });
});
