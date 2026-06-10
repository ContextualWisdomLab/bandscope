import { describe, it, expect, vi } from "vitest";
import { parseBndscpArchive, mockResolveMissingAudio, sanitizeImportPath } from "./import";
import JSZip from "jszip";
import type { BndscpMetadata } from "@bandscope/shared-types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd, args) => {
    if (cmd === "open_audio_file_dialog") {
      return { canceled: false, filePath: args?.suggestedFilename };
    }
  })
}));

describe("sanitizeImportPath", () => {
  it("strips path traversal attempts", () => {
    expect(sanitizeImportPath("../../etc/passwd")).toBe("passwd");
    expect(sanitizeImportPath("C:\\Windows\\System32\\cmd.exe")).toBe("cmd.exe");
    expect(sanitizeImportPath("audio/test.wav")).toBe("test.wav");
    expect(sanitizeImportPath("test.wav")).toBe("test.wav");
  });
});

describe("parseBndscpArchive", () => {
  const createMockArchive = async (metadata: BndscpMetadata, includeAudioFile: boolean) => {
    const zip = new JSZip();
    zip.file("metadata.json", JSON.stringify(metadata));
    if (includeAudioFile) {
      zip.file("audio/s1.m4a", "mock_data");
    }
    return zip.generateAsync({ type: "blob" });
  };

  it("parses valid archive with audio", async () => {
    const metadata: BndscpMetadata = {
      workspace: {
        id: "ws1",
        title: "Test WS",
        workspaceVersion: 1,
        songs: [{
          id: "s1",
          packState: "ready",
          sourceLabel: "song.wav",
          song: {
            id: "song1",
            title: "Test Song",
            sections: [],
            exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
          }
        }]
      },
      analysis_engine_version: "1.0",
      includes_audio: true
    };
    
    const blob = await createMockArchive(metadata, true);
    const result = await parseBndscpArchive(blob);
    
    expect(result.metadata.workspace.id).toBe("ws1");
    expect(result.requiresMissingAudio).toHaveLength(0);
    expect(result.audioFiles.has("s1")).toBe(true);
  });

  it("identifies missing audio", async () => {
    const metadata: BndscpMetadata = {
      workspace: {
        id: "ws1",
        title: "Test WS",
        workspaceVersion: 1,
        songs: [{
          id: "s1",
          packState: "ready",
          sourceLabel: "song.wav",
          song: {
            id: "song1",
            title: "Test Song",
            sections: [],
            exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
          }
        }]
      },
      analysis_engine_version: "1.0",
      includes_audio: true
    };
    
    // Archive missing the actual audio file
    const blob = await createMockArchive(metadata, false);
    const result = await parseBndscpArchive(blob);
    
    expect(result.requiresMissingAudio).toContain("s1");
    expect(result.audioFiles.has("s1")).toBe(false);
  });

  it("identifies missing audio when includes_audio is false", async () => {
    const metadata: BndscpMetadata = {
      workspace: {
        id: "ws1",
        title: "Test WS",
        workspaceVersion: 1,
        songs: [{
          id: "s1",
          packState: "queued",
          sourceLabel: "song.wav",
          engineState: "queued"
        }]
      },
      analysis_engine_version: "1.0",
      includes_audio: false
    };
    
    const blob = await createMockArchive(metadata, false);
    const result = await parseBndscpArchive(blob);
    
    expect(result.requiresMissingAudio).toContain("s1");
  });

  it("throws on missing metadata.json", async () => {
    const zip = new JSZip();
    zip.file("other.txt", "data");
    const blob = await zip.generateAsync({ type: "blob" });
    
    await expect(parseBndscpArchive(blob)).rejects.toThrow("missing metadata.json");
  });
  
  it("throws on malformed metadata.json", async () => {
    const zip = new JSZip();
    zip.file("metadata.json", "{ invalid json");
    const blob = await zip.generateAsync({ type: "blob" });
    
    await expect(parseBndscpArchive(blob)).rejects.toThrow("malformed metadata.json");
  });
});

describe("mockResolveMissingAudio", () => {
  it("returns a mock file", async () => {
    const file = await mockResolveMissingAudio("s1", "some/path/file.wav");
    expect(file?.name).toBe("file.wav");
    expect(file?.type).toBe("audio/wav");
  });
});
