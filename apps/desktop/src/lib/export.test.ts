import { describe, it, expect } from "vitest";
import { sanitizeFilename, escapeCsvField, generateCueSheetCsv, generateChartSummaryJson } from "./export";
import type { RehearsalSong } from "@bandscope/shared-types";

describe("export sanitization", () => {
  it("sanitizes filename correctly", () => {
    expect(sanitizeFilename("My Song /: Test")).toBe("My Song __ Test");
    expect(sanitizeFilename("Valid-Name_123")).toBe("Valid-Name_123");
    expect(sanitizeFilename("")).toBe("export");
  });

  it("handles directory traversal attempts", () => {
    expect(sanitizeFilename("../../../etc/passwd")).toBe("_________etc_passwd");
    expect(sanitizeFilename("..\\..\\windows\\system32")).toBe("______windows_system32");
  });

  it("handles Windows reserved characters", () => {
    expect(sanitizeFilename("<>:\"/\\|?*")).toBe("_________");
    expect(sanitizeFilename("file<name>with:reserved\"chars")).toBe("file_name_with_reserved_chars");
  });

  it("handles whitespace correctly", () => {
    expect(sanitizeFilename("   ")).toBe("export");
    expect(sanitizeFilename("\t\n")).toBe("export");
    expect(sanitizeFilename("  leading and trailing  ")).toBe("leading and trailing");
  });

  describe("escapeCsvField", () => {
    it("returns normal text as-is", () => {
      expect(escapeCsvField("Normal text")).toBe("Normal text");
      expect(escapeCsvField("12345")).toBe("12345");
      expect(escapeCsvField("hello world")).toBe("hello world");
    });

    it("encloses in double quotes if it contains a comma", () => {
      expect(escapeCsvField("Text, with comma")).toBe('"Text, with comma"');
      expect(escapeCsvField(",Leading comma")).toBe('",Leading comma"');
      expect(escapeCsvField("Trailing comma,")).toBe('"Trailing comma,"');
    });

    it("encloses in double quotes and escapes existing double quotes", () => {
      expect(escapeCsvField('Text with "quotes"')).toBe('"Text with ""quotes"""');
      expect(escapeCsvField('"Only quotes"')).toBe('"""Only quotes"""');
    });

    it("encloses in double quotes if it contains newlines or carriage returns", () => {
      expect(escapeCsvField("Text with\nnewline")).toBe('"Text with\nnewline"');
      expect(escapeCsvField("Text with\rcarriage return")).toBe('"Text with\rcarriage return"');
      expect(escapeCsvField("Text with\r\nboth")).toBe('"Text with\r\nboth"');
    });

    it("prevents formula injection by prefixing =, +, -, @ with a single quote", () => {
      expect(escapeCsvField("=1+2")).toBe("'=1+2");
      expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
      expect(escapeCsvField("-100")).toBe("'-100");
      expect(escapeCsvField("@cmd")).toBe("'@cmd");
    });

    it("handles combined scenarios: formula injection with structural characters", () => {
      expect(escapeCsvField("=\n=HYPERLINK(\"http://evil\")")).toBe('"\'=\n=HYPERLINK(""http://evil"")"');
      expect(escapeCsvField('=A1+", trailing"')).toBe('"\'=A1+"", trailing"""');
      expect(escapeCsvField("@some,value")).toBe('"\'@some,value"');
    });

    it("handles edge cases: empty string, single character", () => {
      expect(escapeCsvField("")).toBe("");
      expect(escapeCsvField("=")).toBe("'=");
      expect(escapeCsvField(",")).toBe('","');
      expect(escapeCsvField('"')).toBe('""""');
      expect(escapeCsvField(" ")).toBe(" ");
    });
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
