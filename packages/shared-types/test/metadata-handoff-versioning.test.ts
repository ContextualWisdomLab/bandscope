import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong, parseMetadataHandoffArtifact } from "../src/index";

function legacyV1Artifact() {
  const song = createDemoRehearsalSong();
  return {
    artifactKind: "bandscope.metadata-handoff",
    artifactVersion: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    workspace: {
      id: "workspace-1",
      title: "Friday rehearsal",
      workspaceVersion: 1
    },
    song: {
      id: song.id,
      title: song.title,
      exportSummary: song.exportSummary
    },
    sections: [
      {
        id: song.sections[0]!.id,
        label: song.sections[0]!.label,
        timeRange: song.sections[0]!.timeRange,
        confidence: song.sections[0]!.confidence,
        roleBuckets: [
          {
            id: song.sections[0]!.roles[0]!.id,
            name: song.sections[0]!.roles[0]!.name,
            roleType: song.sections[0]!.roles[0]!.roleType,
            confidence: song.sections[0]!.roles[0]!.confidence,
            rehearsalPriority: song.sections[0]!.roles[0]!.rehearsalPriority
          }
        ]
      }
    ],
    sourceAssets: []
  } as const;
}

const firstAction = {
  sectionId: "verse-1",
  sectionLabel: "verse",
  roleId: "bass-guitar",
  roleName: "Bass Guitar",
  lowestNote: "C#2",
  highestNote: "E3",
  clash: true
} as const;

describe("metadata handoff versioning", () => {
  it("keeps the shipped v1 schema strict and accepts firstAction only under v2", () => {
    const v1 = legacyV1Artifact();

    expect(parseMetadataHandoffArtifact(v1)).toEqual(v1);
    expect(() => parseMetadataHandoffArtifact({ ...v1, firstAction })).toThrow("firstAction");

    expect(parseMetadataHandoffArtifact({
      ...v1,
      artifactVersion: 2,
      firstAction
    })).toEqual({
      ...v1,
      artifactVersion: 2,
      firstAction
    });
  });
});
