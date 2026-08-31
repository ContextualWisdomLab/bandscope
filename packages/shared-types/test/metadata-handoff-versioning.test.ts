import { describe, expect, it } from "vitest";
import {
  createDemoRehearsalSong,
  isMetadataHandoffArtifact,
  parseMetadataHandoffArtifact
} from "../src/index";

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

function v2(overrides: Record<string, unknown> = {}) {
  return {
    ...legacyV1Artifact(),
    artifactVersion: 2,
    firstAction,
    ...overrides
  };
}

describe("metadata handoff versioning", () => {
  it("keeps the v1 schema strict and accepts the first-action field only under v2", () => {
    const v1 = legacyV1Artifact();

    expect(parseMetadataHandoffArtifact(v1)).toEqual(v1);
    expect(() => parseMetadataHandoffArtifact({ ...v1, firstAction })).toThrow("firstAction");
    expect(parseMetadataHandoffArtifact(v2())).toEqual(v2());
  });

  it("fails closed on unsupported or malformed v2 envelopes", () => {
    expect(() => parseMetadataHandoffArtifact(null)).toThrow("root");
    expect(() => parseMetadataHandoffArtifact({ ...legacyV1Artifact(), artifactVersion: 3 })).toThrow("artifactVersion");
    expect(() => parseMetadataHandoffArtifact({ ...legacyV1Artifact(), artifactVersion: 2 })).toThrow("firstAction");
    expect(() => parseMetadataHandoffArtifact(v2({ firstAction: null }))).toThrow("firstAction");
    expect(() => parseMetadataHandoffArtifact(v2({ firstAction: { ...firstAction, extraField: true } }))).toThrow("firstAction.extraField");
    expect(() => parseMetadataHandoffArtifact(v2({ firstAction: { ...firstAction, sectionId: 3 } }))).toThrow("firstAction.sectionId");
    expect(() => parseMetadataHandoffArtifact(v2({ firstAction: { ...firstAction, roleId: "   " } }))).toThrow("firstAction.roleId");
    expect(() => parseMetadataHandoffArtifact(v2({ firstAction: { ...firstAction, sectionLabel: 3 } }))).toThrow("firstAction.sectionLabel");
    expect(() => parseMetadataHandoffArtifact(v2({ firstAction: { ...firstAction, sectionLabel: "solo" } }))).toThrow("firstAction.sectionLabel");
    expect(() => parseMetadataHandoffArtifact(v2({ firstAction: { ...firstAction, clash: "yes" } }))).toThrow("firstAction.clash");
    expect(() => parseMetadataHandoffArtifact(v2({ unexpected: true }))).toThrow("unexpected");
  });

  it("rejects fabricated or internally inconsistent v2 first actions", () => {
    expect(() =>
      parseMetadataHandoffArtifact(
        v2({ firstAction: { ...firstAction, lowestNote: "H2" } })
      )
    ).toThrow("firstAction.lowestNote");
    expect(() =>
      parseMetadataHandoffArtifact(
        v2({ firstAction: { ...firstAction, lowestNote: "E3", highestNote: "C#2" } })
      )
    ).toThrow("firstAction.highestNote");
    expect(() =>
      parseMetadataHandoffArtifact(
        v2({ firstAction: { ...firstAction, sectionId: "missing-section" } })
      )
    ).toThrow("firstAction.sectionId");
    expect(() =>
      parseMetadataHandoffArtifact(
        v2({ firstAction: { ...firstAction, sectionLabel: "chorus" } })
      )
    ).toThrow("firstAction.sectionLabel");
    expect(() =>
      parseMetadataHandoffArtifact(
        v2({ firstAction: { ...firstAction, roleId: "missing-role" } })
      )
    ).toThrow("firstAction.roleId");
    expect(() =>
      parseMetadataHandoffArtifact(
        v2({ firstAction: { ...firstAction, roleName: "Someone Else" } })
      )
    ).toThrow("firstAction.roleName");
  });

  it("exposes a boolean guard for both supported versions and invalid input", () => {
    expect(isMetadataHandoffArtifact(legacyV1Artifact())).toBe(true);
    expect(isMetadataHandoffArtifact(v2())).toBe(true);
    expect(isMetadataHandoffArtifact(v2({ firstAction: { ...firstAction, roleName: "" } }))).toBe(false);
  });
});
