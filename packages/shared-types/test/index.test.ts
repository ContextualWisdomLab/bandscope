import {
  createAnalysisJobStatus,
  createDemoAnalysisJobRequest,
  createDefaultProjectSummary,
  createDemoRehearsalSong,
  isRehearsalSong,
  isAnalysisJobStatus,
  parseRehearsalSong,
  parseAnalysisJobRequest,
  type RehearsalSong,
  SUPPORTED_AUDIO_FORMATS
} from "../src/index";

describe("shared type helpers", () => {
  it("creates a project summary for a fresh analysis job", () => {
    expect(
      createDefaultProjectSummary({
        id: "project-1",
        title: "Demo Song"
      })
    ).toEqual({
      id: "project-1",
      title: "Demo Song",
      status: "idle",
      supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
    });
  });

  it("validates analysis job requests and status envelopes", () => {
    const request = createDemoAnalysisJobRequest();
    const status = createAnalysisJobStatus({
      jobId: "job-1",
      state: "succeeded",
      result: createDemoRehearsalSong()
    });

    expect(request).toEqual({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
    });
    expect(parseAnalysisJobRequest(request)).toEqual(request);
    expect(() => parseAnalysisJobRequest(null)).toThrow("root");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "file",
      sourceLabel: "Late Night Set",
      roleFocus: []
    })).toThrow("sourceKind");
    expect(() => parseAnalysisJobRequest({ sourceKind: "demo" })).toThrow("sourceLabel");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: {}
    })).toThrow("roleFocus");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: [7]
    })).toThrow("roleFocus[0]");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"],
      extraField: true
    })).toThrow("extraField");
    expect(isAnalysisJobStatus(status)).toBe(true);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      error: {
        code: "not_found",
        message: "Missing"
      }
    })).toBe(true);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "succeeded",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })).toBe(false);
    expect(isAnalysisJobStatus(null)).toBe(false);
    expect(isAnalysisJobStatus({
      state: "queued",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "unknown",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "queued",
      requestedAt: 1,
      updatedAt: "2026-03-12T00:00:00.000Z"
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "queued",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: 1
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "queued",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      progressLabel: 42
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "succeeded",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      result: { id: "bad" }
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      error: []
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      error: { code: "bad_code", message: "oops" }
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      error: { code: "not_found" }
    })).toBe(false);
  });

  it("creates a rehearsal song with section and role level guidance", () => {
    const song = createDemoRehearsalSong();

    expect(song).toMatchObject({
      id: "demo-song",
      title: "Late Night Set",
      sections: [
        {
          id: "verse-1",
          label: "Verse 1",
          confidence: {
            level: "medium",
            source: "model"
          },
          roles: [
            {
              id: "bass-guitar",
              name: "Bass Guitar",
              roleType: "instrument"
            },
            {
              id: "keys-right",
              name: "Keyboard 1 Right Hand",
              roleType: "hand",
              harmony: {
                chord: "Emaj7",
                source: "model"
              }
            },
            {
              id: "lead-vocal",
              name: "Lead Vocal",
              roleType: "vocal",
              cue: {
                kind: "lyric",
                value: "city lights"
              }
            }
          ]
        }
      ],
      exportSummary: {
        format: "cue-sheet"
      }
    });

    expect(song.sections[0]?.roles[2]?.harmony?.source).toBe("model");
    expect(song.sections[0]?.roles[2]?.manualOverrides?.[0]).toMatchObject({
      field: "harmony",
      source: "user",
      value: {
        chord: "C#m11"
      }
    });
  });

  it("returns a fresh copy of the rehearsal song fixture", () => {
    const first = createDemoRehearsalSong();
    const second = createDemoRehearsalSong();

    first.sections[0]?.roles[2]?.manualOverrides?.splice(0, 1);

    expect(second).not.toBe(first);
    expect(second.sections).not.toBe(first.sections);
    expect(second.sections[0]?.roles).not.toBe(first.sections[0]?.roles);
    expect(second.sections[0]?.roles[2]?.manualOverrides).toHaveLength(1);
  });

  it("validates and parses rehearsal song payloads", () => {
    const song = createDemoRehearsalSong();
    const malformedSong = createDemoRehearsalSong() as unknown as {
      sections: Array<{ roles: unknown[] }>;
    };
    const sparseSong = createDemoRehearsalSong() as unknown as {
      exportSummary: { focusSections: string[] };
      sections: Array<{ roles: unknown[] }>;
    };
    const sparseSongWithProperty = createDemoRehearsalSong() as unknown as {
      exportSummary: { focusSections: string[] & { label?: string } };
    };
    const arrayPayload = Object.assign([], {
      id: "array-song",
      title: "Array Song",
      sections: [],
      exportSummary: {
        format: "cue-sheet",
        headline: "Array payload",
        focusSections: []
      }
    });
    malformedSong.sections[0]!.roles = [{ id: "broken-role" }];
    sparseSong.exportSummary.focusSections = new Array<string>(1);
    sparseSongWithProperty.exportSummary.focusSections = new Array<string>(1) as string[] & {
      label?: string;
    };
    sparseSongWithProperty.exportSummary.focusSections.label = "ghost";

    expect(isRehearsalSong(song)).toBe(true);
    expect(isRehearsalSong({ id: "bad" })).toBe(false);
    expect(isRehearsalSong({
      id: "bad",
      title: "Bad",
      sections: [],
      exportSummary: {
        format: 42,
        headline: "oops"
      }
    })).toBe(false);
    expect(isRehearsalSong(malformedSong)).toBe(false);
    expect(isRehearsalSong(sparseSong)).toBe(false);
    expect(isRehearsalSong(sparseSongWithProperty)).toBe(false);
    expect(isRehearsalSong(arrayPayload)).toBe(false);

    const parsed = parseRehearsalSong(song);
    parsed.sections[0]?.roles.splice(0, 1);

    expect(parsed.sections[0]?.roles).toHaveLength(2);
    expect(song.sections[0]?.roles).toHaveLength(3);
    expect(() => parseRehearsalSong(null)).toThrow("Invalid rehearsal song contract");
    expect(() => parseRehearsalSong({
      id: "bad",
      title: "Bad",
      sections: [],
      exportSummary: {
        format: 42,
        headline: "oops"
      }
    })).toThrow("exportSummary.format");
  });

  it("reports the first invalid field path for nested contract failures", () => {
    const roleSparse = createDemoRehearsalSong() as unknown as {
      sections: Array<{ roles: unknown[] }>;
    };
    const badOverride = createDemoRehearsalSong() as unknown as {
      sections: Array<{ roles: Array<{ manualOverrides: Array<{ value: { source: string } }> }> }>;
    };
    const badHeadline = createDemoRehearsalSong() as unknown as {
      exportSummary: { headline: unknown };
    };
    const badFocusSection = createDemoRehearsalSong() as unknown as {
      exportSummary: { focusSections: unknown[] };
    };
    const badExportSummary = createDemoRehearsalSong() as unknown as {
      exportSummary: unknown;
    };
    const missingId = { ...createDemoRehearsalSong(), id: 42 };
    const sparseSections = createDemoRehearsalSong() as unknown as { sections: RehearsalSong["sections"] };

    roleSparse.sections[0]!.roles = new Array(1);
    badOverride.sections[0]!.roles[2]!.manualOverrides[0]!.value.source = "model";
    badHeadline.exportSummary.headline = 99;
    badFocusSection.exportSummary.focusSections = ["Verse 1", 7];
    badExportSummary.exportSummary = [];
    sparseSections.sections = new Array(1) as RehearsalSong["sections"];

    expect(() => parseRehearsalSong(roleSparse)).toThrow("sections[0].roles");
    expect(() => parseRehearsalSong(badOverride)).toThrow("manualOverrides[0].value.source");
    expect(() => parseRehearsalSong(badHeadline)).toThrow("exportSummary.headline");
    expect(() => parseRehearsalSong(badFocusSection)).toThrow("exportSummary.focusSections[1]");
    expect(() => parseRehearsalSong(badExportSummary)).toThrow("exportSummary");
    expect(() => parseRehearsalSong(missingId)).toThrow("id");
    expect(() => parseRehearsalSong(sparseSections)).toThrow("sections");
  });

  it("covers detailed validation branches", () => {
    const createInvalidSong = (mutate: (song: RehearsalSong) => unknown) => {
      const song = createDemoRehearsalSong();
      mutate(song);
      return song;
    };

    const cases: Array<{ message: string; payload: unknown }> = [
      { message: "title", payload: { id: "song" } },
      {
        message: "sections[0]",
        payload: { ...createDemoRehearsalSong(), sections: [null] }
      },
      {
        message: "sections[0].id",
        payload: createInvalidSong((song) => {
          (song.sections[0] as RehearsalSong["sections"][number]).id = 4 as never;
        })
      },
      {
        message: "sections[0].label",
        payload: createInvalidSong((song) => {
          (song.sections[0] as RehearsalSong["sections"][number]).label = 4 as never;
        })
      },
      {
        message: "sections[0].groove",
        payload: createInvalidSong((song) => {
          (song.sections[0] as RehearsalSong["sections"][number]).groove = 4 as never;
        })
      },
      {
        message: "sections[0].confidence.level",
        payload: createInvalidSong((song) => {
          song.sections[0]!.confidence.level = "certain" as never;
        })
      },
      {
        message: "sections[0].confidence.source",
        payload: createInvalidSong((song) => {
          song.sections[0]!.confidence.source = "other" as never;
        })
      },
      {
        message: "sections[0].confidence.notes",
        payload: createInvalidSong((song) => {
          song.sections[0]!.confidence.notes = 1 as never;
        })
      },
      {
        message: "sections[0].confidence",
        payload: createInvalidSong((song) => {
          song.sections[0]!.confidence = null as never;
        })
      },
      {
        message: "sections[0].roles[0].id",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.id = 7 as never;
        })
      },
      {
        message: "sections[0].roles[0]",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0] = null as never;
        })
      },
      {
        message: "sections[0].roles[0].name",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.name = 7 as never;
        })
      },
      {
        message: "sections[0].roles[0].roleType",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.roleType = "drums" as never;
        })
      },
      {
        message: "sections[0].roles[0].harmony",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.harmony = null as never;
        })
      },
      {
        message: "sections[0].roles[0].harmony.chord",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.harmony.chord = 3 as never;
        })
      },
      {
        message: "sections[0].roles[0].harmony.functionLabel",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.harmony.functionLabel = 3 as never;
        })
      },
      {
        message: "sections[0].roles[0].harmony.source",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.harmony.source = "other" as never;
        })
      },
      {
        message: "sections[0].roles[0].cue",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.cue = null as never;
        })
      },
      {
        message: "sections[0].roles[0].cue.kind",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.cue.kind = "bar" as never;
        })
      },
      {
        message: "sections[0].roles[0].cue.value",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.cue.value = 2 as never;
        })
      },
      {
        message: "sections[0].roles[0].range",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.range = null as never;
        })
      },
      {
        message: "sections[0].roles[0].range.lowestNote",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.range.lowestNote = 2 as never;
        })
      },
      {
        message: "sections[0].roles[0].range.highestNote",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.range.highestNote = 2 as never;
        })
      },
      {
        message: "sections[0].roles[0].confidence",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.confidence = null as never;
        })
      },
      {
        message: "sections[0].roles[0].rehearsalPriority",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.rehearsalPriority = "urgent" as never;
        })
      },
      {
        message: "sections[0].roles[0].simplification",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.simplification = 2 as never;
        })
      },
      {
        message: "sections[0].roles[0].setupNote",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.setupNote = 2 as never;
        })
      },
      {
        message: "sections[0].roles[2].manualOverrides[0]",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[2]!.manualOverrides[0] = null as never;
        })
      },
      {
        message: "sections[0].roles[2].manualOverrides[0].field",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[2]!.manualOverrides[0]!.field = "cue" as never;
        })
      },
      {
        message: "sections[0].roles[2].manualOverrides[0].source",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[2]!.manualOverrides[0]!.source = "model" as never;
        })
      },
      {
        message: "sections[0].roles[2].manualOverrides[0].value.chord",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[2]!.manualOverrides[0]!.value.chord = 5 as never;
        })
      },
      {
        message: "sections[0].roles[0].manualOverrides",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.manualOverrides = new Array(1) as never;
        })
      },
      {
        message: "exportSummary.focusSections",
        payload: createInvalidSong((song) => {
          song.exportSummary.focusSections = new Array(1) as never;
        })
      }
    ];

    for (const testCase of cases) {
      expect(() => parseRehearsalSong(testCase.payload)).toThrow(testCase.message);
    }
  });
});
