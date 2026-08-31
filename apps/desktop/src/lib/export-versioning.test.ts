import { createDemoRehearsalSong, type ProjectBootstrapSummary } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { createMetadataHandoffArtifact, createReanalysisRequestFromHandoff } from "./export";

const replacementSource: ProjectBootstrapSummary = {
  projectId: "recipient-project",
  sourceMode: "reference",
  projectRoot: "/tmp/bandscope/projects/recipient-project",
  cacheRoot: "/tmp/bandscope/cache/recipient-project",
  tempRoot: "/tmp/bandscope/temp/recipient-project",
  source: {
    sourcePath: "/Users/recipient/Music/late-night-set.wav",
    fileName: "late-night-set.wav",
    extension: "wav",
    fileSizeBytes: 1_024_000
  }
};

const firstAction = {
  sectionId: "verse-1",
  sectionLabel: "verse",
  roleId: "bass-guitar",
  roleName: "Bass Guitar",
  lowestNote: "C#2",
  highestNote: "E3",
  clash: true
} as const;

describe("metadata handoff export versioning", () => {
  it("keeps legacy handoffs on v1 and emits first-action handoffs as v2", () => {
    const song = createDemoRehearsalSong();

    expect(createMetadataHandoffArtifact(song, { createdAt: "2026-09-01T00:00:00.000Z" }).artifactVersion).toBe(1);
    expect(createMetadataHandoffArtifact(song, {
      createdAt: "2026-09-01T00:00:00.000Z",
      firstAction
    })).toMatchObject({
      artifactVersion: 2,
      firstAction
    });
  });

  it("re-analyzes both legacy v1 and first-action v2 handoffs", () => {
    const song = createDemoRehearsalSong();
    const v1 = createMetadataHandoffArtifact(song, { createdAt: "2026-09-01T00:00:00.000Z" });
    const v2 = createMetadataHandoffArtifact(song, {
      createdAt: "2026-09-01T00:00:00.000Z",
      firstAction
    });

    expect(createReanalysisRequestFromHandoff(v1, replacementSource)).toEqual(
      createReanalysisRequestFromHandoff(v2, replacementSource)
    );
  });
});
