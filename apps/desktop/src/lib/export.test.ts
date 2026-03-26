import { describe, it, expect } from "vitest";
import { sanitizeFilename, escapeCsvField, generateCueSheetCsv, generateChartSummaryJson } from "./export";
import type { RehearsalSong } from "@bandscope/shared-types";

describe("export sanitization", () => {
  it("sanitizes filename correctly", () => {
    expect(sanitizeFilename("My Song /: Test")).toBe("My Song __ Test");
    expect(sanitizeFilename("Valid-Name_123")).toBe("Valid-Name_123");
    expect(sanitizeFilename("")).toBe("export");
  });

  it("escapes CSV fields to prevent formula injection", () => {
    expect(escapeCsvField("=1+2")).toBe("'=1+2");
    expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvField("-100")).toBe("'-100");
    expect(escapeCsvField("@cmd")).toBe("'@cmd");
    expect(escapeCsvField("Normal text")).toBe("Normal text");
    expect(escapeCsvField("Text, with comma")).toBe('"Text, with comma"');
    expect(escapeCsvField('Text with "quotes"')).toBe('"Text with ""quotes"""');
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
            manualOverrides: []
          }
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
