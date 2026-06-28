import { describe, it, expect } from "vitest";
import {
  sanitizeFilename,
  escapeCsvField,
  generateCueSheetCsv,
  generateChartSummaryJson,
  generateMetadataHandoffJson,
  createReanalysisRequestFromHandoff
} from "./export";
import type { ProjectBootstrapSummary, RehearsalSong } from "@bandscope/shared-types";

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

      // Prevent bypasses using leading whitespace or newlines
      expect(escapeCsvField(" =1+2")).toBe("' =1+2");
      expect(escapeCsvField("\t+SUM(A1)")).toBe("'\t+SUM(A1)");
      expect(escapeCsvField("\n-100")).toBe("\"'\n-100\"");
      expect(escapeCsvField("\r@cmd")).toBe("\"'\r@cmd\"");
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

  const createTestSection = (
    overrides: Partial<RehearsalSong["sections"][number]> = {}
  ): RehearsalSong["sections"][number] => ({
    id: "section-test",
    label: "bridge",
    groove: "straight",
    confidence: { level: "high", source: "model", notes: "" },
    roles: [],
    partGraph: [],
    ...overrides
  });

  const createTestSong = (overrides: Partial<RehearsalSong> = {}): RehearsalSong => ({
    ...mockSong,
    sections: mockSong.sections.map((section) => ({
      ...section,
      confidence: { ...section.confidence },
      roles: section.roles.map((role) => ({
        ...role,
        harmony: { ...role.harmony },
        cue: { ...role.cue },
        range: { ...role.range },
        confidence: { ...role.confidence },
        manualOverrides: [...role.manualOverrides],
        overlapWarnings: [...role.overlapWarnings]
      })),
      partGraph: section.partGraph.map((node) => ({
        ...node,
        handoff_to: [...node.handoff_to],
        handoff_from: [...node.handoff_from]
      }))
    })),
    exportSummary: {
      ...mockSong.exportSummary,
      focusSections: [...mockSong.exportSummary.focusSections]
    },
    ...overrides
  });

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

  it("generates chart summary JSON with an empty title and sections", () => {
    const jsonStr = generateChartSummaryJson(createTestSong({
      title: "",
      sections: []
    }));
    const parsed = JSON.parse(jsonStr);

    expect(parsed).toEqual({
      title: "",
      headline: "Headline",
      sections: []
    });
  });

  it("generates chart summary JSON with empty roles in a section", () => {
    const jsonStr = generateChartSummaryJson(createTestSong({
      sections: [createTestSection()]
    }));
    const parsed = JSON.parse(jsonStr);

    expect(parsed.sections).toEqual([
      {
        label: "bridge",
        groove: "straight",
        roles: []
      }
    ]);
  });

  it("generates chart summary JSON when exportSummary is missing at runtime", () => {
    const songNoSummary = createTestSong();
    Reflect.deleteProperty(songNoSummary, "exportSummary");

    const jsonStr = generateChartSummaryJson(songNoSummary);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.headline).toBe("");
  });

  it("generates a metadata-only local handoff without source paths or transcription data", () => {
    const sourceBootstrap: ProjectBootstrapSummary = {
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source: {
        sourcePath: "/Users/test/Music/late-night-set.wav",
        fileName: "late-night-set.wav",
        extension: "wav",
        fileSizeBytes: 1_024_000
      }
    };
    const songWithTranscription: RehearsalSong = {
      ...mockSong,
      sections: [{
        ...mockSong.sections[0]!,
        roles: [{
          ...mockSong.sections[0]!.roles[0]!,
          transcription: [{ pitch: "E2", onset: 0, offset: 1, velocity: 0.7 }]
        }]
      }]
    };

    const json = generateMetadataHandoffJson(songWithTranscription, {
      createdAt: "2026-06-15T08:30:00.000Z",
      sourceBootstrap,
      workspaceId: "workspace-1",
      workspaceTitle: "Friday rehearsal"
    });
    const parsed = JSON.parse(json);

    expect(parsed).toMatchObject({
      artifactKind: "bandscope.metadata-handoff",
      artifactVersion: 1,
      workspace: { id: "workspace-1", title: "Friday rehearsal", workspaceVersion: 1 },
      song: { id: "test", title: "Test" },
      sourceAssets: [{
        referenceKind: "local_audio",
        sourceMode: "reference",
        fileName: "late-night-set.wav",
        extension: "wav",
        fileSizeBytes: 1_024_000,
        status: "referenced"
      }]
    });
    expect(json).not.toContain("/Users/test");
    expect(json).not.toContain("sourcePath");
    expect(json).not.toContain("transcription");
    expect(parsed.sections[0].roleBuckets[0]).toEqual({
      id: "r1",
      name: "Bass",
      roleType: "instrument",
      confidence: { level: "high", source: "model", notes: "" },
      rehearsalPriority: "high"
    });
  });

  it("uses the song identity as the default handoff workspace identity", () => {
    const json = generateMetadataHandoffJson(mockSong, {
      createdAt: "2026-06-15T08:30:00.000Z"
    });
    const parsed = JSON.parse(json);

    expect(parsed.workspace).toEqual({
      id: "test",
      title: "Test",
      workspaceVersion: 1
    });
  });

  it("creates a local re-analysis request from a received handoff and selected replacement asset", () => {
    const handoff = JSON.parse(generateMetadataHandoffJson(mockSong, {
      createdAt: "2026-06-15T08:30:00.000Z",
      workspaceId: "workspace-1",
      workspaceTitle: "Friday rehearsal"
    }));
    const selectedSource: ProjectBootstrapSummary = {
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

    expect(createReanalysisRequestFromHandoff(handoff, selectedSource)).toEqual({
      sourceKind: "local_audio",
      projectId: "recipient-project",
      sourceLabel: "late-night-set.wav",
      roleFocus: ["r1"]
    });
  });
});
