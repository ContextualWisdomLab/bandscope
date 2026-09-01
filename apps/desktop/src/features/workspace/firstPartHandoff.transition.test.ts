import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstPartHandoff } from "./firstPartHandoff";

function activityTransition(): RehearsalSong {
  const song = createDemoRehearsalSong();
  const template = song.sections[0]!;
  const bass = template.roles.find((role) => role.id === "bass-guitar");
  const vocal = template.roles.find((role) => role.id === "lead-vocal");
  if (!bass || !vocal) {
    throw new Error("Demo fixture must contain bass and lead vocal roles");
  }

  const source = {
    ...structuredClone(template),
    id: "verse-source",
    label: "verse" as const,
    timeRange: { start: 0, end: 10 },
    roles: [{ ...bass, rehearsalPriority: "high" as const }],
    partGraph: [
      {
        role_id: "bass-guitar",
        is_active: true,
        handoff_to: ["lead-vocal"],
        handoff_from: []
      },
      {
        role_id: "lead-vocal",
        is_active: false,
        handoff_to: [],
        handoff_from: ["bass-guitar"]
      }
    ]
  };
  const destination = {
    ...structuredClone(template),
    id: "chorus-destination",
    label: "chorus" as const,
    timeRange: { start: 10, end: 30 },
    roles: [{ ...vocal, rehearsalPriority: "medium" as const }],
    partGraph: [
      {
        role_id: "bass-guitar",
        is_active: false,
        handoff_to: [],
        handoff_from: []
      },
      {
        role_id: "lead-vocal",
        is_active: true,
        handoff_to: [],
        handoff_from: []
      }
    ]
  };

  return { ...song, sections: [source, destination] };
}

describe("resolveFirstPartHandoff activity transition", () => {
  it("names and opens the destination section for an analysis-derived handoff", () => {
    const resolved = resolveFirstPartHandoff(activityTransition());

    expect(resolved?.section.id).toBe("chorus-destination");
    expect(resolved?.givingRole.id).toBe("bass-guitar");
    expect(resolved?.receivingRole.id).toBe("lead-vocal");
    expect(resolved?.givingName).toBe("Bass Guitar");
    expect(resolved?.receivingName).toBe("Lead Vocal");
    expect(resolved?.atSeconds).toBe(10);
  });

  it("requires the source graph receiver to corroborate the outgoing edge", () => {
    const song = activityTransition();
    song.sections[0]!.partGraph[1]!.handoff_from = [];

    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("requires the receiver to become active in the destination", () => {
    const song = activityTransition();
    song.sections[1]!.partGraph[1]!.is_active = false;

    expect(resolveFirstPartHandoff(song)).toBeNull();
  });

  it("does not invent a transition for a one-section song", () => {
    const song = activityTransition();
    song.sections = [song.sections[0]!];

    expect(resolveFirstPartHandoff(song)).toBeNull();
  });
});
