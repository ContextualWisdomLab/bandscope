import { describe, it, expect } from "vitest";
import { sanitizeFilename, escapeCsvField, generateCueSheetCsv, generateChartSummaryJson, generateBndscpArchive } from "./export";
import type { RehearsalSong, RehearsalWorkspace } from "@bandscope/shared-types";
import JSZip from "jszip";

describe("export sanitization", () => {
  it("sanitizes filename correctly", () => {
    expect(sanitizeFilename("My Song /: Test")).toBe("My Song __ Test");
    expect(sanitizeFilename("Valid-Name_123")).toBe("Valid-Name_123");
    expect(sanitizeFilename("")).toBe("export");
  });

  it("escapes CSV fields to prevent formula injection", () => {
    expect(escapeCsvField("=1+2")).toBe("'=1+2");
    expect(escapeCsvField("=\n=HYPERLINK(\"http://evil\")")).toBe('"\'=\n=HYPERLINK(""http://evil"")"');
    expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvField("-100")).toBe("'-100");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
    expect(escapeCsvField("Normal text")).toBe("Normal text");
    expect(escapeCsvField("Text, with comma")).toBe('"Text, with comma"');
    expect(escapeCsvField('Text with "quotes"')).toBe('"Text with ""quotes"""');
    expect(escapeCsvField("Text with\rcarriage return")).toBe('"Text with\rcarriage return"');
  });
});

describe("export generation", () => {
  const mockSong: RehearsalSong = {
    id: "test",
    title: "Test",
    exportSummary: { format: "cue-sheet", headline: "Headline", focusSections: [] },
    sections: [
      {
        id: "s1",
        label: "verse",
        groove: "swing",
        confidence: { level: "high", source: "model", notes: "" },
        roles: [
          {
            id: "r1",
            name: "Bass",
            roleType: "instrument",
            harmony: { chord: "=Cmaj7", functionLabel: "", source: "model" },
            cue: { kind: "count", value: "1, 2, 3" },
            range: { lowestNote: "C2", highestNote: "C3" },
            confidence: { level: "high", source: "model", notes: "" },
            rehearsalPriority: "high",
            simplification: "simple",
            setupNote: "setup",
            manualOverrides: [],
            overlapWarnings: []
          }
        ],
        partGraph: [
          { role_id: "r1", is_active: true, handoff_to: [], handoff_from: [] }
        ]
      }
    ]
  };

  it("generates cue sheet CSV securely", () => {
    const csv = generateCueSheetCsv(mockSong);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Section,Groove,Role,Harmony,Cue,Priority,Notes");
    expect(lines[1]).toBe('verse,swing,Bass,\'=Cmaj7,"1, 2, 3",high,setup | simple');
  });

  it("generates chart summary JSON", () => {
    const jsonStr = generateChartSummaryJson(mockSong);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.title).toBe("Test");
    expect(parsed.sections[0].roles[0].chord).toBe("=Cmaj7");
  });

  it("generates chart summary JSON when headline is missing", () => {
    const mockSongNoHeadline: RehearsalSong = {
      ...mockSong,
      exportSummary: { format: "chart-summary", headline: "", focusSections: [] }
    };
    const jsonStr = generateChartSummaryJson(mockSongNoHeadline);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.headline).toBe("");
  });
});

describe("generateBndscpArchive", () => {
  it("generates zip archive with metadata and audio text mock", async () => {
    const mockWorkspace: RehearsalWorkspace = {
      id: "ws1",
      title: "My WS",
      workspaceVersion: 1,
      songs: [
        {
          id: "pack1",
          packState: "ready",
          sourceLabel: "song1.wav",
          song: {
            id: "s1",
            title: "My Song",
            sections: [],
            exportSummary: { format: "cue-sheet", headline: "", focusSections: [] }
          }
        },
        {
          id: "pack2",
          packState: "failed",
          sourceLabel: "song2.wav",
          error: { code: "not_found", message: "Error" }
        }
      ]
    };
    
    const blobWithAudio = await generateBndscpArchive(mockWorkspace, true);
    expect(blobWithAudio).toBeInstanceOf(Blob);
    
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(blobWithAudio);
    
    const metadataStr = await loadedZip.file("metadata.json")?.async("string");
    expect(metadataStr).toBeDefined();
    const metadata = JSON.parse(metadataStr!);
    expect(metadata.includes_audio).toBe(true);
    expect(metadata.workspace.id).toBe("ws1");
    
    const audioText = await loadedZip.file("audio/My Song.txt")?.async("string");
    expect(audioText).toBe("MOCK_COMPRESSED_AUDIO_DATA");
  });

  it("generates zip archive without audio", async () => {
    const mockWorkspace: RehearsalWorkspace = {
      id: "ws1",
      title: "My WS",
      workspaceVersion: 1,
      songs: []
    };
    
    const blobWithoutAudio = await generateBndscpArchive(mockWorkspace, false);
    
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(blobWithoutAudio);
    
    const metadataStr = await loadedZip.file("metadata.json")?.async("string");
    const metadata = JSON.parse(metadataStr!);
    expect(metadata.includes_audio).toBe(false);
    
    const allFiles = Object.keys(loadedZip.files);
    expect(allFiles).not.toContain("audio/My_Song.txt");
  });
});
