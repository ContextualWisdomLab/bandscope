import { describe, expect, it } from "vitest";
import {
  parseAnalysisJobRequest,
  parseLocalAudioSource,
  type AnalysisJobRequest,
  type LocalAudioSource
} from "../src/index";

const keys = [
  ["ordinary", "extra"],
  ["synthetic-path", "/synthetic/PRIVATE_KEY_MARKER/never-read.wav"],
  ["controls-unicode", "PRIVATE_KEY_MARKER\n\r\t\0\u001b\u202e\u2066끝\u2069"],
  ["bounded-4115", "PRIVATE_KEY_MARKER_" + "x".repeat(4096)]
] as const;

const source: LocalAudioSource = {
  sourcePath: "/synthetic/never-opened.wav",
  fileName: "Authorized name\t끝.wav",
  extension: "wav",
  fileSizeBytes: 64
};
const demo: AnalysisJobRequest = {
  sourceKind: "demo",
  sourceLabel: "Authorized label\n\u202e끝",
  roleFocus: []
};
const local: AnalysisJobRequest = {
  sourceKind: "local_audio",
  projectId: "synthetic-project",
  sourceLabel: demo.sourceLabel,
  roleFocus: ["bass-guitar"]
};

// These are distinct public containers: the shared request deliberately does not
// embed localSource, which the desktop validates separately with its own parser.
describe("fixed unknown-field request diagnostics", () => {
  it.each(keys)("rejects %s at the demo request root without reflecting its name", (_id, key) => {
    expect(() => parseAnalysisJobRequest({ ...demo, [key]: "UNKNOWN_VALUE_NOT_PUBLIC" }))
      .toThrow(new Error("Invalid analysis job request: unknown field in 'root'"));
  });

  it.each(keys)("rejects %s at the local request root without reflecting its name", (_id, key) => {
    expect(() => parseAnalysisJobRequest({ ...local, [key]: "UNKNOWN_VALUE_NOT_PUBLIC" }))
      .toThrow(new Error("Invalid analysis job request: unknown field in 'root'"));
  });

  it.each(keys)("rejects %s in a separately parsed local source without reflecting its name", (_id, key) => {
    expect(() => parseLocalAudioSource({ ...source, [key]: "UNKNOWN_VALUE_NOT_PUBLIC" }))
      .toThrow(new Error("Invalid local audio source: unknown field in 'root'"));
  });

  it("keeps forbidden localSource rejected without widening the shared request schema", () => {
    expect(() => parseAnalysisJobRequest({ ...local, localSource: source }))
      .toThrow(new Error("Invalid analysis job request: unknown field in 'root'"));
  });

  it("preserves authorized labels and separately parsed local metadata", () => {
    expect(parseAnalysisJobRequest(demo)).toEqual(demo);
    expect(parseAnalysisJobRequest(local)).toEqual(local);
    expect(parseLocalAudioSource(source)).toEqual(source);
    expect(parseAnalysisJobRequest(local)).not.toBe(local);
    expect(parseLocalAudioSource(source)).not.toBe(source);
  });

  it("preserves compiled known-field diagnostics", () => {
    expect(() => parseAnalysisJobRequest({ ...demo, sourceKind: [] }))
      .toThrow(new Error("Invalid analysis job request: invalid field 'sourceKind'"));
    expect(() => parseAnalysisJobRequest({ ...local, projectId: " " }))
      .toThrow(new Error("Invalid analysis job request: invalid field 'projectId'"));
    expect(() => parseLocalAudioSource({ ...source, extension: {} }))
      .toThrow(new Error("Invalid local audio source: invalid field 'extension'"));
    expect(() => parseLocalAudioSource({ ...source, fileSizeBytes: -1 }))
      .toThrow(new Error("Invalid local audio source: invalid field 'fileSizeBytes'"));
  });
});
