import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstEarCheck } from "./firstEarCheck";

describe("resolveFirstEarCheck inactive-role hint ownership", () => {
  function songWithInactiveOnlyUncertainty() {
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
    return song;
  }

  it("skips a section whose only uncertainty belongs to an inactive part", () => {
    expect(resolveFirstEarCheck(songWithInactiveOnlyUncertainty())).toBeNull();
  });

  it("reports a band-wide ear check from section uncertainty without surfacing inactive-part notes", () => {
    const song = songWithInactiveOnlyUncertainty();
    const section = song.sections[0]!;
    section.confidence = {
      level: "medium",
      source: "model",
      notes: "Section-level notes carry tonight's guidance."
    };

    const resolved = resolveFirstEarCheck(song);

    expect(resolved?.section.id).toBe(section.id);
    expect(resolved?.holdingRole).toBeNull();
    expect(resolved?.hint).toBe("Section-level notes carry tonight's guidance.");
  });
});
