import { describe, expect, it, vi } from "vitest";
import type {
  AnalysisJobRequest,
  MetadataHandoffArtifact,
  ProjectBootstrapSummary
} from "@bandscope/shared-types";
import {
  MAX_HANDOFF_FILE_BYTES,
  createAnalysisRequestForSelection,
  handoffRoleFocus,
  readMetadataHandoffFile,
  type MetadataHandoffFile
} from "./handoff";

function validHandoff(): MetadataHandoffArtifact {
  return {
    artifactKind: "bandscope.metadata-handoff",
    artifactVersion: 1,
    createdAt: "2026-08-03T03:20:00.000Z",
    workspace: {
      id: "workspace-1",
      title: "Friday rehearsal",
      workspaceVersion: 1
    },
    song: {
      id: "song-1",
      title: "Late Night Set",
      exportSummary: {
        format: "cue-sheet",
        headline: "Start with the chorus entrance.",
        focusSections: ["chorus"]
      }
    },
    sections: [
      {
        id: "verse-1",
        label: "verse",
        timeRange: { start: 0, end: 30 },
        confidence: { level: "medium", source: "model", notes: "Check pickup." },
        roleBuckets: [
          {
            id: "bass-guitar",
            name: "Bass Guitar",
            roleType: "instrument",
            confidence: { level: "high", source: "model", notes: "" },
            rehearsalPriority: "high"
          },
          {
            id: "lead-vocal",
            name: "Lead Vocal",
            roleType: "vocal",
            confidence: { level: "medium", source: "model", notes: "" },
            rehearsalPriority: "medium"
          }
        ]
      },
      {
        id: "chorus-1",
        label: "chorus",
        timeRange: { start: 30, end: 60 },
        confidence: { level: "high", source: "model", notes: "" },
        roleBuckets: [
          {
            id: "bass-guitar",
            name: "Bass Guitar",
            roleType: "instrument",
            confidence: { level: "high", source: "model", notes: "" },
            rehearsalPriority: "high"
          }
        ]
      }
    ],
    sourceAssets: []
  };
}

function handoffFile(
  name: string,
  bytes: Uint8Array,
  reportedSize = bytes.byteLength
): MetadataHandoffFile & { slice: ReturnType<typeof vi.fn> } {
  const payload = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([payload]);
  const slice = vi.fn((start?: number, end?: number) => blob.slice(start, end));
  return { name, size: reportedSize, slice };
}

function jsonFile(payload: unknown, name = "friday-handoff.json"): ReturnType<typeof handoffFile> {
  return handoffFile(name, new TextEncoder().encode(JSON.stringify(payload)));
}

function selectedSource(): ProjectBootstrapSummary {
  return {
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
}

describe("metadata handoff import", () => {
  it("accepts bounded UTF-8 JSON and validates the artifact contract", async () => {
    const result = await readMetadataHandoffFile(jsonFile(validHandoff(), "FRIDAY-HANDOFF.JSON"));

    expect(result).toEqual({
      ok: true,
      fileName: "FRIDAY-HANDOFF.JSON",
      artifact: validHandoff(),
      roleFocus: ["bass-guitar", "lead-vocal"]
    });
  });

  it("rejects a non-JSON filename before reading bytes", async () => {
    const file = jsonFile(validHandoff(), "friday-handoff.txt");

    await expect(readMetadataHandoffFile(file)).resolves.toEqual({
      ok: false,
      code: "unsupported_file"
    });
    expect(file.slice).not.toHaveBeenCalled();
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_HANDOFF_FILE_BYTES + 1
  ])("rejects unsafe reported size %s before reading bytes", async (reportedSize) => {
    const file = handoffFile(
      "friday-handoff.json",
      new Uint8Array([0x7b, 0x7d]),
      reportedSize
    );

    await expect(readMetadataHandoffFile(file)).resolves.toEqual({
      ok: false,
      code: "too_large"
    });
    expect(file.slice).not.toHaveBeenCalled();
  });

  it("rechecks the actual byte length after bounded reading", async () => {
    const file = handoffFile(
      "friday-handoff.json",
      new Uint8Array(MAX_HANDOFF_FILE_BYTES + 1),
      1
    );

    await expect(readMetadataHandoffFile(file)).resolves.toEqual({
      ok: false,
      code: "too_large"
    });
    expect(file.slice).toHaveBeenCalledWith(0, MAX_HANDOFF_FILE_BYTES + 1);
  });

  it("rejects a truncated or unstable browser file read", async () => {
    const file = handoffFile(
      "friday-handoff.json",
      new Uint8Array([0x7b, 0x7d]),
      1
    );

    await expect(readMetadataHandoffFile(file)).resolves.toEqual({
      ok: false,
      code: "read_failed"
    });
  });

  it("rejects malformed UTF-8 without replacement-character parsing", async () => {
    const file = handoffFile("friday-handoff.json", new Uint8Array([0xc3, 0x28]));

    await expect(readMetadataHandoffFile(file)).resolves.toEqual({
      ok: false,
      code: "invalid_utf8"
    });
  });

  it("distinguishes malformed JSON from an invalid BandScope artifact", async () => {
    const malformedJson = handoffFile(
      "friday-handoff.json",
      new TextEncoder().encode("{not-json")
    );
    await expect(readMetadataHandoffFile(malformedJson)).resolves.toEqual({
      ok: false,
      code: "invalid_json"
    });

    const wrongArtifact = jsonFile({ artifactKind: "other-product" });
    await expect(readMetadataHandoffFile(wrongArtifact)).resolves.toEqual({
      ok: false,
      code: "invalid_artifact"
    });
  });

  it("reports read failures without exposing the underlying exception", async () => {
    const file: MetadataHandoffFile = {
      name: "friday-handoff.json",
      size: 12,
      slice: vi.fn(
        () =>
          ({
            arrayBuffer: vi.fn(async () => {
              throw new Error("/Users/private/secret.json could not be read");
            })
          }) as unknown as Blob
      )
    };

    await expect(readMetadataHandoffFile(file)).resolves.toEqual({
      ok: false,
      code: "read_failed"
    });
  });
});

describe("handoff-focused analysis request", () => {
  const defaultRequest: AnalysisJobRequest = {
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["keys-right"]
  };

  it("deduplicates role focus while preserving first-seen order", () => {
    expect(handoffRoleFocus(validHandoff())).toEqual(["bass-guitar", "lead-vocal"]);
  });

  it("keeps the default request until the user selects local audio", () => {
    expect(createAnalysisRequestForSelection(defaultRequest, null, validHandoff())).toEqual(
      defaultRequest
    );
  });

  it("keeps the existing local-audio path when no handoff is pending", () => {
    expect(createAnalysisRequestForSelection(defaultRequest, selectedSource(), null)).toEqual({
      sourceKind: "local_audio",
      projectId: "recipient-project",
      sourceLabel: "late-night-set.wav",
      roleFocus: ["keys-right"]
    });
  });

  it("uses received role focus with the recipient's local audio source", () => {
    expect(
      createAnalysisRequestForSelection(defaultRequest, selectedSource(), validHandoff())
    ).toEqual({
      sourceKind: "local_audio",
      projectId: "recipient-project",
      sourceLabel: "late-night-set.wav",
      roleFocus: ["bass-guitar", "lead-vocal"]
    });
  });
});
