import {
  createAnalysisJobStatus,
  createDemoAnalysisJobRequest,
  createProjectBootstrapSummary,
  createDefaultProjectSummary,
  createDemoRehearsalSong,
  isRehearsalSong,
  isAnalysisJobStatus,
  parseAnalysisJobStatus,
  parseLocalAudioSource,
  parseProjectBootstrapSummary,
  parseRehearsalSong,
  isRehearsalWorkspace,
  parseRehearsalWorkspace,
  isBndscpMetadata,
  parseBndscpMetadata,
  parseSongRehearsalPack,
  SongRehearsalPack,
  RehearsalWorkspace,
  type BndscpMetadata,
  parseAnalysisJobRequest,
  type AnalysisJobRequest,
  type LocalAudioSource,
  type RehearsalSong,
  MAX_SECTION_TIME_SECONDS,
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
    const queuedStatus = createAnalysisJobStatus({
      jobId: "job-queued",
      state: "queued",
      progressLabel: "Queued for analysis"
    });
    const failedStatus = createAnalysisJobStatus({
      jobId: "job-failed",
      state: "failed",
      error: {
        code: "engine_unavailable",
        message: "Analysis engine is unavailable."
      }
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
      sourceLabel: "   ",
      roleFocus: []
    })).toThrow("sourceLabel");
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
    const legacyResult = createDemoRehearsalSong() as unknown as {
      sections: Array<Record<string, unknown>>;
    };
    delete legacyResult.sections[0]!.timeRange;
    const legacyStatus = {
      jobId: "job-legacy",
      state: "succeeded",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      result: legacyResult
    };
    expect(isAnalysisJobStatus(legacyStatus)).toBe(false);
    expect(parseAnalysisJobStatus(legacyStatus).result?.sections[0]?.timeRange).toEqual({ start: 0, end: 1 });
    expect(failedStatus).toEqual({
      jobId: "job-failed",
      state: "failed",
      requestedAt: failedStatus.requestedAt,
      updatedAt: failedStatus.updatedAt,
      error: {
        code: "engine_unavailable",
        message: "Analysis engine is unavailable."
      }
    });
    expect(queuedStatus).toEqual({
      jobId: "job-queued",
      state: "queued",
      requestedAt: queuedStatus.requestedAt,
      updatedAt: queuedStatus.updatedAt,
      progressLabel: "Queued for analysis"
    });
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
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "queued",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      extraField: true
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      error: { code: "not_found", message: "Missing", extraField: true }
    })).toBe(false);
  });

  it("validates local audio sources and bootstrap requests", () => {
    const source: LocalAudioSource = {
      sourcePath: "/Users/test/Music/late-night-set.wav",
      fileName: "late-night-set.wav",
      extension: "wav",
      fileSizeBytes: 1_024_000
    };
    const request: AnalysisJobRequest = {
      sourceKind: "local_audio",
      projectId: "project-1",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"]
    };

    expect(parseLocalAudioSource(source)).toEqual(source);
    expect(() => parseLocalAudioSource(null)).toThrow("root");
    expect(() => parseLocalAudioSource({ ...source, extraField: true })).toThrow("extraField");
    expect(() => parseLocalAudioSource({ ...source, sourcePath: "   " })).toThrow("sourcePath");
    expect(() => parseLocalAudioSource({ ...source, fileName: "   " })).toThrow("fileName");
    expect(parseAnalysisJobRequest(request)).toEqual(request);
    expect(() => parseLocalAudioSource({ ...source, extension: "ogg" })).toThrow("extension");
    expect(() => parseLocalAudioSource({ ...source, fileSizeBytes: -1 })).toThrow("fileSizeBytes");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "local_audio",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"]
    })).toThrow("projectId");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "local_audio",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"],
      localSource: source
    })).toThrow("localSource");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "local_audio",
      projectId: "project-1",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"],
      localSource: source
    })).toThrow("localSource");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "local_audio",
      projectId: "project-1",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"],
      localSource: { ...source, sourcePath: "" }
    })).toThrow("localSource");
    expect(() => parseAnalysisJobRequest({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar"],
      localSource: source
    })).toThrow("localSource");

    expect(createProjectBootstrapSummary({
      projectId: "project-1",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    })).toEqual({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    });
    expect(parseProjectBootstrapSummary({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    })).toEqual({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    });
    expect(() => parseProjectBootstrapSummary(null)).toThrow("root");
    expect(() => parseProjectBootstrapSummary({
      projectId: "project-1",
      sourceMode: "copy",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    })).toThrow("sourceMode");
    expect(() => parseProjectBootstrapSummary({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source,
      extraField: true
    })).toThrow("extraField");
    expect(() => parseProjectBootstrapSummary({
      projectId: "   ",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    })).toThrow("projectId");
    expect(() => parseProjectBootstrapSummary({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    })).toThrow("projectRoot");
    expect(() => parseProjectBootstrapSummary({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source
    })).toThrow("cacheRoot");
    expect(() => parseProjectBootstrapSummary({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "",
      source
    })).toThrow("tempRoot");
    expect(() => parseProjectBootstrapSummary({
      projectId: "project-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-1",
      cacheRoot: "/tmp/bandscope/cache/project-1",
      tempRoot: "/tmp/bandscope/temp/project-1",
      source: { ...source, extension: "ogg" }
    })).toThrow("project bootstrap summary.source");
  });

  it("creates a rehearsal song with section and role level guidance", () => {
    const song = createDemoRehearsalSong();

    expect(song).toMatchObject({
      id: "demo-song",
      title: "Late Night Set",
      sections: [
        {
          id: "verse-1",
          label: "verse",
          timeRange: {
            start: 10,
            end: 30
          },
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
    const legacySong = createDemoRehearsalSong() as unknown as {
      sections: Array<Record<string, unknown>>;
    };
    delete legacySong.sections[0]!.timeRange;
    const migrated = parseRehearsalSong(legacySong);
    expect(migrated.sections[0]?.timeRange).toEqual({ start: 0, end: 1 });
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
    badFocusSection.exportSummary.focusSections = ["verse", 7];
    badExportSummary.exportSummary = [];
    sparseSections.sections = new Array(1) as RehearsalSong["sections"];

    expect(() => parseRehearsalSong(roleSparse)).toThrow("sections[0].roles");
    expect(() => parseRehearsalSong(badOverride)).toThrow("manualOverrides[0].value.source");
    expect(() => parseRehearsalSong(badHeadline)).toThrow("exportSummary.headline");
    expect(() => parseRehearsalSong(badFocusSection)).toThrow("exportSummary.focusSections[1]");
    expect(() => parseRehearsalSong(badExportSummary)).toThrow("exportSummary");
    expect(() => parseRehearsalSong(missingId)).toThrow("id");
    expect(() => parseRehearsalSong(sparseSections)).toThrow("sections");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      extraField: true
    })).toThrow("extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      exportSummary: {
        ...createDemoRehearsalSong().exportSummary,
        extraField: true
      }
    })).toThrow("exportSummary.extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      sections: [{
        ...createDemoRehearsalSong().sections[0],
        extraField: true
      }]
    })).toThrow("sections[0].extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      sections: [{
        ...createDemoRehearsalSong().sections[0],
        confidence: {
          ...createDemoRehearsalSong().sections[0].confidence,
          extraField: true
        },
        roles: createDemoRehearsalSong().sections[0].roles
      }]
    })).toThrow("sections[0].confidence.extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      sections: [{
        ...createDemoRehearsalSong().sections[0],
        roles: [{
          ...createDemoRehearsalSong().sections[0].roles[0],
          extraField: true
        }]
      }]
    })).toThrow("sections[0].roles[0].extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      sections: [{
        ...createDemoRehearsalSong().sections[0],
        roles: [{
          ...createDemoRehearsalSong().sections[0].roles[0],
          harmony: {
            ...createDemoRehearsalSong().sections[0].roles[0].harmony,
            extraField: true
          }
        }]
      }]
    })).toThrow("sections[0].roles[0].harmony.extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      sections: [{
        ...createDemoRehearsalSong().sections[0],
        roles: [{
          ...createDemoRehearsalSong().sections[0].roles[0],
          cue: {
            ...createDemoRehearsalSong().sections[0].roles[0].cue,
            extraField: true
          }
        }]
      }]
    })).toThrow("sections[0].roles[0].cue.extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      sections: [{
        ...createDemoRehearsalSong().sections[0],
        roles: [{
          ...createDemoRehearsalSong().sections[0].roles[0],
          range: {
            ...createDemoRehearsalSong().sections[0].roles[0].range,
            extraField: true
          }
        }]
      }]
    })).toThrow("sections[0].roles[0].range.extraField");
    expect(() => parseRehearsalSong({
      ...createDemoRehearsalSong(),
      sections: [{
        ...createDemoRehearsalSong().sections[0],
        roles: [{
          ...createDemoRehearsalSong().sections[0].roles[0],
          manualOverrides: [{
            ...createDemoRehearsalSong().sections[0].roles[2].manualOverrides[0],
            extraField: true
          }]
        }]
      }]
    })).toThrow("sections[0].roles[0].manualOverrides[0].extraField");
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
        message: "sections[0].timeRange",
        payload: createInvalidSong((song) => {
          (song.sections[0] as unknown as Record<string, unknown>).timeRange = null;
        })
      },
      {
        message: "sections[0].timeRange.extraField",
        payload: createInvalidSong((song) => {
          (song.sections[0]!.timeRange as unknown as Record<string, unknown>).extraField = true;
        })
      },
      {
        message: "sections[0].timeRange.start",
        payload: createInvalidSong((song) => {
          song.sections[0]!.timeRange.start = -1;
        })
      },
      {
        message: "sections[0].timeRange.start",
        payload: createInvalidSong((song) => {
          song.sections[0]!.timeRange.start = 10.5;
        })
      },
      {
        message: "sections[0].timeRange.end",
        payload: createInvalidSong((song) => {
          song.sections[0]!.timeRange.end = 10;
        })
      },
      {
        message: "sections[0].timeRange.end",
        payload: createInvalidSong((song) => {
          song.sections[0]!.timeRange.end = 30.5;
        })
      },
      {
        message: "sections[0].timeRange.start",
        payload: createInvalidSong((song) => {
          song.sections[0]!.timeRange.start = MAX_SECTION_TIME_SECONDS + 1;
          song.sections[0]!.timeRange.end = MAX_SECTION_TIME_SECONDS + 2;
        })
      },
      {
        message: "sections[0].timeRange.end",
        payload: createInvalidSong((song) => {
          song.sections[0]!.timeRange.end = MAX_SECTION_TIME_SECONDS + 1;
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
        message: "sections[0].roles[0].overlapWarnings",
        payload: createInvalidSong((song) => {
          (song.sections[0]!.roles[0] as unknown as Record<string, unknown>).overlapWarnings = "not-an-array";
        })
      },
      {
        message: "sections[0].roles[0].overlapWarnings[0]",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.overlapWarnings = [42 as never];
        })
      },
      {
        message: "sections[0].partGraph",
        payload: createInvalidSong((song) => {
          (song.sections[0] as unknown as Record<string, unknown>).partGraph = "not-an-array";
        })
      },
      {
        message: "sections[0].partGraph[0]",
        payload: createInvalidSong((song) => {
          song.sections[0]!.partGraph = [null as never];
        })
      },
      {
        message: "sections[0].partGraph[0].role_id",
        payload: createInvalidSong((song) => {
          song.sections[0]!.partGraph[0]!.role_id = 42 as never;
        })
      },
      {
        message: "sections[0].partGraph[0].is_active",
        payload: createInvalidSong((song) => {
          song.sections[0]!.partGraph[0]!.is_active = "yes" as never;
        })
      },
      {
        message: "sections[0].partGraph[0].handoff_to",
        payload: createInvalidSong((song) => {
          song.sections[0]!.partGraph[0]!.handoff_to = "not-an-array" as never;
        })
      },
      {
        message: "sections[0].partGraph[0].handoff_to[0]",
        payload: createInvalidSong((song) => {
          song.sections[0]!.partGraph[0]!.handoff_to = [42 as never];
        })
      },
      {
        message: "sections[0].partGraph[0].handoff_from",
        payload: createInvalidSong((song) => {
          song.sections[0]!.partGraph[0]!.handoff_from = "not-an-array" as never;
        })
      },
      {
        message: "sections[0].partGraph[0].handoff_from[0]",
        payload: createInvalidSong((song) => {
          song.sections[0]!.partGraph[0]!.handoff_from = [42 as never];
        })
      },
      {
        message: "sections[0].partGraph[0].extraField",
        payload: createInvalidSong((song) => {
          (song.sections[0]!.partGraph[0] as unknown as Record<string, unknown>).extraField = true;
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

  it("validates SongRehearsalPack and RehearsalWorkspace", () => {
    const validPack: SongRehearsalPack = {
      id: "pack-1",
      packState: "ready",
      sourceLabel: "Test Song",
      song: createDemoRehearsalSong(),
      engineState: "succeeded"
    };

    const validWorkspace: RehearsalWorkspace = {
      id: "ws-1",
      title: "My Workspace",
      workspaceVersion: 1,
      songs: [validPack]
    };

    expect(parseSongRehearsalPack(validPack)).toEqual(validPack);
    expect(isRehearsalWorkspace(validWorkspace)).toBe(true);
    expect(parseRehearsalWorkspace(validWorkspace)).toEqual(validWorkspace);

    const legacyNestedSong = createDemoRehearsalSong() as unknown as {
      sections: Array<Record<string, unknown>>;
    };
    delete legacyNestedSong.sections[0]!.timeRange;
    const legacyNestedPack = {
      ...validPack,
      song: legacyNestedSong as unknown as RehearsalSong
    };
    const parsedLegacyPack = parseSongRehearsalPack(legacyNestedPack);
    const parsedLegacyWorkspace = parseRehearsalWorkspace({
      ...validWorkspace,
      songs: [legacyNestedPack]
    });

    expect(parsedLegacyPack.song.sections[0]?.timeRange).toEqual({ start: 0, end: 1 });
    expect(isRehearsalWorkspace({ ...validWorkspace, songs: [legacyNestedPack] })).toBe(false);
    expect(parsedLegacyWorkspace.songs[0]?.song?.sections[0]?.timeRange).toEqual({ start: 0, end: 1 });

    // Invalid packs
    expect(() => parseSongRehearsalPack({ ...validPack, packState: "invalid" })).toThrow("packState");
    expect(() => parseSongRehearsalPack({ ...validPack, extraField: true })).toThrow("extraField");
    
    // Invalid workspaces
    expect(isRehearsalWorkspace({ ...validWorkspace, songs: [{...validPack, packState: "bad"}] })).toBe(false);
    expect(() => parseRehearsalWorkspace({ ...validWorkspace, id: 123 })).toThrow("id");
    expect(() => parseRehearsalWorkspace({ ...validWorkspace, workspaceVersion: "1" })).toThrow("workspaceVersion");

    // Coverage for error and engineState and song errors
    expect(() => parseSongRehearsalPack({ ...validPack, engineState: "bad" })).toThrow("engineState");
    expect(() => parseSongRehearsalPack({ ...validPack, song: { ...validPack.song, id: 123 } })).toThrow("id");
    const packWithoutSong = { ...validPack };
    delete packWithoutSong.song;
    expect(() => parseSongRehearsalPack({ ...packWithoutSong, packState: "failed", error: { code: "bad", message: "m" } })).toThrow("error.code");
    

    // Valid cases with error and no song
    expect(parseSongRehearsalPack({
      id: "pack-2",
      packState: "failed",
      sourceLabel: "Test",
      error: { code: "not_found", message: "missing" }
    })).toBeTruthy();

    expect(() => parseSongRehearsalPack({ ...validPack, packState: "ready", song: { id: 123 } as unknown as RehearsalSong })).toThrow("id");


    expect(() => parseRehearsalWorkspace(null)).toThrow("root");
    expect(() => parseRehearsalWorkspace({ ...validWorkspace, extra: 1 })).toThrow("extra");
    expect(() => parseRehearsalWorkspace({ ...validWorkspace, title: 123 })).toThrow("title");
    expect(() => parseRehearsalWorkspace({ ...validWorkspace, songs: {} })).toThrow("songs");
    expect(() => parseRehearsalWorkspace({ ...validWorkspace, songs: [null] })).toThrow("songs[0]");

    expect(() => parseSongRehearsalPack({ ...validPack, id: 123 })).toThrow("id");
    expect(() => parseSongRehearsalPack({ ...validPack, sourceLabel: 123 })).toThrow("sourceLabel");
  });
  it("validates BndscpMetadata", () => {
    const validWorkspace: RehearsalWorkspace = {
      id: "ws-1",
      title: "My Workspace",
      workspaceVersion: 1,
      songs: []
    };
    const validMetadata: BndscpMetadata = {
      workspace: validWorkspace,
      analysis_engine_version: "1.0.0",
      includes_audio: true
    };
    
    expect(isBndscpMetadata(validMetadata)).toBe(true);
    expect(parseBndscpMetadata(validMetadata)).toEqual(validMetadata);
    
    expect(() => parseBndscpMetadata(null)).toThrow("root");
    expect(() => parseBndscpMetadata({ ...validMetadata, analysis_engine_version: 123 })).toThrow("analysis_engine_version");
    expect(() => parseBndscpMetadata({ ...validMetadata, includes_audio: "true" })).toThrow("includes_audio");
    expect(() => parseBndscpMetadata({ ...validMetadata, workspace: null })).toThrow("root");
    expect(() => parseBndscpMetadata({ ...validMetadata, extra: true })).toThrow("extra");
  });
});
