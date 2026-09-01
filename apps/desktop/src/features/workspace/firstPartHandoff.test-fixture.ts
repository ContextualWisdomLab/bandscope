import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";

/** Build a two-section fixture matching analysis-engine deactivate/activate handoff topology. */
export function createPartHandoffTransitionSong(): RehearsalSong {
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
      { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
      { role_id: "lead-vocal", is_active: false, handoff_to: [], handoff_from: ["bass-guitar"] }
    ]
  };
  const destination = {
    ...structuredClone(template),
    id: "chorus-destination",
    label: "chorus" as const,
    timeRange: { start: 10, end: 30 },
    roles: [{ ...vocal, rehearsalPriority: "medium" as const }],
    partGraph: [
      { role_id: "bass-guitar", is_active: false, handoff_to: [], handoff_from: [] },
      { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: [] }
    ]
  };

  return { ...song, sections: [source, destination] };
}
