import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

function withValidHandoff() {
  const song = createDemoRehearsalSong();
  const verse = song.sections[0]!;
  const handoff = structuredClone(verse);
  const role = structuredClone(verse.roles[0]!);
  role.id = "handoff-bass";
  role.name = "Handoff Bass";
  role.rehearsalPriority = "high";
  handoff.id = "handoff-sparse-boundary";
  handoff.label = "handoff";
  handoff.timeRange = { start: 20, end: 22 };
  handoff.roles = [role];
  handoff.partGraph = [
    {
      role_id: role.id,
      is_active: true,
      handoff_to: [],
      handoff_from: []
    }
  ];
  song.sections = [verse, handoff];
  return song;
}

describe("first labeled handoff dense-array boundary", () => {
  it("rejects a sparse section collection instead of skipping missing evidence", () => {
    const song = withValidHandoff();
    const sparseSections: typeof song.sections = new Array(2);
    sparseSections[1] = song.sections[1]!;
    song.sections = sparseSections;

    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });

  it("keeps the pass band-wide when the role collection is sparse", () => {
    const song = withValidHandoff();
    const handoff = song.sections[1]!;
    const sparseRoles: typeof handoff.roles = new Array(2);
    sparseRoles[1] = handoff.roles[0]!;
    handoff.roles = sparseRoles;

    const result = resolveFirstLabeledHandoff(song);
    expect(result?.section.id).toBe("handoff-sparse-boundary");
    expect(result?.holdingRole).toBeNull();
  });

  it("keeps the pass band-wide when the part graph is sparse", () => {
    const song = withValidHandoff();
    const handoff = song.sections[1]!;
    const sparseGraph: typeof handoff.partGraph = new Array(2);
    sparseGraph[1] = handoff.partGraph[0]!;
    handoff.partGraph = sparseGraph;

    const result = resolveFirstLabeledHandoff(song);
    expect(result?.section.id).toBe("handoff-sparse-boundary");
    expect(result?.holdingRole).toBeNull();
  });
});
