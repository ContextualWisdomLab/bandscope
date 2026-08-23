import fc from "fast-check";
import {
  createAnalysisJobStatus,
  createDemoAnalysisJobRequest,
  createProjectBootstrapSummary,
  createDefaultProjectSummary,
  createDemoRehearsalSong,
  isRehearsalSong,
  isProjectSummary,
  isAnalysisJobStatus,
  parseAnalysisJobStatus,
  parseLocalAudioSource,
  parseMetadataHandoffArtifact,
  parseProjectSummary,
  parseProjectBootstrapSummary,
  parseRehearsalSong,
  validateProjectSummary,
  isMetadataHandoffArtifact,
  isRehearsalWorkspace,
  parseRehearsalWorkspace,
  parseSongRehearsalPack,
  type MetadataHandoffArtifact,
  SongRehearsalPack,
  RehearsalWorkspace,
  parseAnalysisJobRequest,
  type AnalysisJobRequest,
  type LocalAudioSource,
  type ProjectSummary,
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

  it("creates a project summary with empty strings", () => {
    expect(
      createDefaultProjectSummary({
        id: "",
        title: ""
      })
    ).toEqual({
      id: "",
      title: "",
      status: "idle",
      supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
    });
  });

  it("creates a project summary with special characters in id and title", () => {
    expect(
      createDefaultProjectSummary({
        id: "!@#$%^&*()",
        title: "Song with \n special chars \t and symbols !?"
      })
    ).toEqual({
      id: "!@#$%^&*()",
      title: "Song with \n special chars \t and symbols !?",
      status: "idle",
      supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
    });
  });

  it("validates project summaries at process boundaries", () => {
    const statuses: ProjectSummary["status"][] = ["idle", "running", "done", "failed"];

    for (const status of statuses) {
      const summary: ProjectSummary = {
        id: `project-${status}`,
        title: `Project ${status}`,
        status,
        supportedAudioFormats: ["wav", "mp3"]
      };

      expect(validateProjectSummary(summary)).toBeNull();
      expect(isProjectSummary(summary)).toBe(true);
      expect(parseProjectSummary(summary)).toEqual(summary);
    }

    const validSummary: ProjectSummary = {
      id: "project-1",
      title: "Demo Song",
      status: "running",
      supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
    };
    const sparseFormats = {
      ...validSummary,
      supportedAudioFormats: new Array(1)
    };

    expect(parseProjectSummary(validSummary)).toEqual(validSummary);
    expect(isProjectSummary({ ...validSummary, status: "queued" })).toBe(false);
    expect(validateProjectSummary(null)).toContain("root");
    expect(() => parseProjectSummary({ ...validSummary, id: "   " })).toThrow("id");
    expect(() => parseProjectSummary({ ...validSummary, title: "" })).toThrow("title");
    expect(() => parseProjectSummary({ ...validSummary, status: "queued" })).toThrow("status");
    expect(() => parseProjectSummary({ ...validSummary, supportedAudioFormats: "wav" })).toThrow("supportedAudioFormats");
    expect(() => parseProjectSummary(sparseFormats)).toThrow("supportedAudioFormats");
    expect(() => parseProjectSummary({ ...validSummary, supportedAudioFormats: ["ogg"] })).toThrow("supportedAudioFormats[0]");
    expect(() => parseProjectSummary({ ...validSummary, extraField: true })).toThrow("extraField");
  });

  it("snapshots array length while validating dense array boundaries", () => {
    let lengthReads = 0;
    let entriesStarted = false;
    const supportedAudioFormats = new Proxy(["wav"], {
      get(target, property, receiver) {
        if (property === "entries") {
          entriesStarted = true;
        }
        if (property === "length") {
          lengthReads += 1;
          return !entriesStarted && lengthReads > 1 ? 2 : Reflect.get(target, property, receiver);
        }
        return Reflect.get(target, property, receiver);
      }
    }) as ProjectSummary["supportedAudioFormats"];
    const summary: ProjectSummary = {
      id: "project-1",
      title: "Demo Song",
      status: "running",
      supportedAudioFormats
    };

    expect(validateProjectSummary(summary)).toBeNull();
  });

  it("rejects array proxies with non-primitive changing lengths", () => {
    let lengthCoercions = 0;
    const changingLength = {
      valueOf() {
        lengthCoercions += 1;
        return lengthCoercions === 1 ? 2 : 0;
      }
    };
    const supportedAudioFormats = new Proxy(["wav"], {
      get(target, property, receiver) {
        if (property === "length") {
          return changingLength;
        }
        return Reflect.get(target, property, receiver);
      }
    }) as ProjectSummary["supportedAudioFormats"];
    const summary: ProjectSummary = {
      id: "project-1",
      title: "Demo Song",
      status: "running",
      supportedAudioFormats
    };

    expect(validateProjectSummary(summary)).toBe(
      "Invalid project summary contract: invalid field 'supportedAudioFormats'"
    );
    expect(lengthCoercions).toBe(1);
  });

  it("rejects array proxies with non-finite or out-of-range lengths", () => {
    for (const length of [Number.POSITIVE_INFINITY, 0xffffffff + 1, 1.5]) {
      const supportedAudioFormats = new Proxy(["wav"], {
        get(target, property, receiver) {
          if (property === "length") {
            return length;
          }
          return Reflect.get(target, property, receiver);
        }
      }) as ProjectSummary["supportedAudioFormats"];
      const summary: ProjectSummary = {
        id: "project-1",
        title: "Demo Song",
        status: "running",
        supportedAudioFormats
      };

      expect(validateProjectSummary(summary)).toBe(
        "Invalid project summary contract: invalid field 'supportedAudioFormats'"
      );
    }
  });

  it("property-checks supported local audio sources", () => {
    fc.assert(
      fc.property(
        fc.record({
          sourcePath: fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0),
          fileName: fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0),
          extension: fc.constantFrom(...SUPPORTED_AUDIO_FORMATS),
          fileSizeBytes: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER })
        }),
        (source) => {
          expect(parseLocalAudioSource(source)).toEqual(source);
        }
      )
    );
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
      progressLabel: "Queued for analysis",
      progressStage: "queued",
      progressPercent: 0,
      cacheStatus: "disabled"
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
      progressLabel: "Queued for analysis",
      progressStage: "queued",
      progressPercent: 0,
      cacheStatus: "disabled"
    });
    expect(parseAnalysisJobStatus(queuedStatus)).toEqual(queuedStatus);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "running",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:01.000Z",
      progressLabel: "Separating stems... (45%)",
      progressStage: "separate",
      progressPercent: 45,
      cacheStatus: "miss"
    })).toBe(true);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "running",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:01.000Z",
      progressStage: "not-a-stage",
      progressPercent: 45
    })).toBe(false);
    expect(isAnalysisJobStatus({
      jobId: "job-1",
      state: "running",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:01.000Z",
      progressStage: "separate",
      progressPercent: 101
    })).toBe(false);
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
    expect(() => parseAnalysisJobStatus({
      jobId: "job-1",
      state: "running",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      cacheStatus: "warm"
    })).toThrow("cacheStatus");
    expect(() => parseAnalysisJobStatus({ jobId: 7 })).toThrow("jobId");
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

  it("validates metadata-only handoff artifacts without bundled assets or paths", () => {
    const artifact: MetadataHandoffArtifact = {
      artifactKind: "bandscope.metadata-handoff",
      artifactVersion: 1,
      createdAt: "2026-06-15T08:30:00.000Z",
      workspace: {
        id: "workspace-1",
        title: "Friday rehearsal",
        workspaceVersion: 1
      },
      song: {
        id: "demo-song",
        title: "Late Night Set",
        exportSummary: createDemoRehearsalSong().exportSummary
      },
      sections: [
        {
          id: "verse-1",
          label: "verse",
          timeRange: { start: 10, end: 30 },
          confidence: createDemoRehearsalSong().sections[0]!.confidence,
          roleBuckets: [
            {
              id: "bass-guitar",
              name: "Bass Guitar",
              roleType: "instrument",
              confidence: createDemoRehearsalSong().sections[0]!.roles[0]!.confidence,
              rehearsalPriority: "high"
            }
          ]
        }
      ],
      sourceAssets: [
        {
          referenceKind: "local_audio",
          sourceMode: "reference",
          fileName: "late-night-set.wav",
          extension: "wav",
          fileSizeBytes: 1_024_000,
          status: "referenced"
        }
      ]
    };

    expect(isMetadataHandoffArtifact(artifact)).toBe(true);
    expect(parseMetadataHandoffArtifact(artifact)).toEqual(artifact);
    expect(() => parseMetadataHandoffArtifact({
      ...artifact,
      artifactVersion: 2
    })).toThrow("artifactVersion");
    expect(() => parseMetadataHandoffArtifact({
      ...artifact,
      sourceAssets: [{ ...artifact.sourceAssets[0], sourcePath: "/Users/test/Music/late-night-set.wav" }]
    })).toThrow("sourceAssets[0].sourcePath");
    expect(() => parseMetadataHandoffArtifact({
      ...artifact,
      sections: [{
        ...artifact.sections[0],
        roleBuckets: [{ ...artifact.sections[0]!.roleBuckets[0], confidence: { level: "sure" } }]
      }]
    })).toThrow("sections[0].roleBuckets[0].confidence");

    const invalidCases: Array<{ message: string; payload: unknown }> = [
      { message: "root", payload: null },
      { message: "extraField", payload: { ...artifact, extraField: true } },
      { message: "artifactKind", payload: { ...artifact, artifactKind: "other" } },
      { message: "createdAt", payload: { ...artifact, createdAt: "   " } },
      { message: "workspace", payload: { ...artifact, workspace: null } },
      { message: "workspace.extraField", payload: { ...artifact, workspace: { ...artifact.workspace, extraField: true } } },
      { message: "workspace.id", payload: { ...artifact, workspace: { ...artifact.workspace, id: 3 } } },
      { message: "workspace.title", payload: { ...artifact, workspace: { ...artifact.workspace, title: 3 } } },
      { message: "workspace.workspaceVersion", payload: { ...artifact, workspace: { ...artifact.workspace, workspaceVersion: 0 } } },
      { message: "song", payload: { ...artifact, song: null } },
      { message: "song.extraField", payload: { ...artifact, song: { ...artifact.song, extraField: true } } },
      { message: "song.id", payload: { ...artifact, song: { ...artifact.song, id: 3 } } },
      { message: "song.title", payload: { ...artifact, song: { ...artifact.song, title: 3 } } },
      {
        message: "song.exportSummary.format",
        payload: { ...artifact, song: { ...artifact.song, exportSummary: { ...artifact.song.exportSummary, format: "pdf" } } }
      },
      { message: "sections", payload: { ...artifact, sections: "not-an-array" } },
      { message: "sections[0]", payload: { ...artifact, sections: [null] } },
      { message: "sections[0].id", payload: { ...artifact, sections: [{ ...artifact.sections[0], id: 3 }] } },
      { message: "sections[0].label", payload: { ...artifact, sections: [{ ...artifact.sections[0], label: "solo" }] } },
      { message: "sections[0].timeRange.start", payload: { ...artifact, sections: [{ ...artifact.sections[0], timeRange: { start: -1, end: 30 } }] } },
      { message: "sections[0].confidence.source", payload: { ...artifact, sections: [{ ...artifact.sections[0], confidence: { ...artifact.sections[0]!.confidence, source: "other" } }] } },
      { message: "sections[0].roleBuckets", payload: { ...artifact, sections: [{ ...artifact.sections[0], roleBuckets: "not-an-array" }] } },
      { message: "sections[0].roleBuckets[0]", payload: { ...artifact, sections: [{ ...artifact.sections[0], roleBuckets: [null] }] } },
      { message: "sections[0].roleBuckets[0].id", payload: { ...artifact, sections: [{ ...artifact.sections[0], roleBuckets: [{ ...artifact.sections[0]!.roleBuckets[0], id: 3 }] }] } },
      { message: "sections[0].roleBuckets[0].name", payload: { ...artifact, sections: [{ ...artifact.sections[0], roleBuckets: [{ ...artifact.sections[0]!.roleBuckets[0], name: 3 }] }] } },
      { message: "sections[0].roleBuckets[0].roleType", payload: { ...artifact, sections: [{ ...artifact.sections[0], roleBuckets: [{ ...artifact.sections[0]!.roleBuckets[0], roleType: "drums" }] }] } },
      { message: "sections[0].roleBuckets[0].extraField", payload: { ...artifact, sections: [{ ...artifact.sections[0], roleBuckets: [{ ...artifact.sections[0]!.roleBuckets[0], extraField: true }] }] } },
      { message: "sections[0].roleBuckets[0].rehearsalPriority", payload: { ...artifact, sections: [{ ...artifact.sections[0], roleBuckets: [{ ...artifact.sections[0]!.roleBuckets[0], rehearsalPriority: "urgent" }] }] } },
      { message: "sections[0].extraField", payload: { ...artifact, sections: [{ ...artifact.sections[0], extraField: true }] } },
      { message: "sourceAssets", payload: { ...artifact, sourceAssets: "not-an-array" } },
      { message: "sourceAssets[0]", payload: { ...artifact, sourceAssets: [null] } },
      { message: "sourceAssets[0].referenceKind", payload: { ...artifact, sourceAssets: [{ ...artifact.sourceAssets[0], referenceKind: "stem" }] } },
      { message: "sourceAssets[0].sourceMode", payload: { ...artifact, sourceAssets: [{ ...artifact.sourceAssets[0], sourceMode: "copy" }] } },
      { message: "sourceAssets[0].fileName", payload: { ...artifact, sourceAssets: [{ ...artifact.sourceAssets[0], fileName: "   " }] } },
      { message: "sourceAssets[0].extension", payload: { ...artifact, sourceAssets: [{ ...artifact.sourceAssets[0], extension: "ogg" }] } },
      { message: "sourceAssets[0].fileSizeBytes", payload: { ...artifact, sourceAssets: [{ ...artifact.sourceAssets[0], fileSizeBytes: 0 }] } },
      { message: "sourceAssets[0].status", payload: { ...artifact, sourceAssets: [{ ...artifact.sourceAssets[0], status: "bundled" }] } }
    ];

    for (const testCase of invalidCases) {
      expect(() => parseMetadataHandoffArtifact(testCase.payload)).toThrow(testCase.message);
    }
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
      },
      collaboration: {
        syncMode: "planned_cloud"
      }
    });

    expect(song.sections[0]?.roles[2]?.harmony?.source).toBe("model");
    expect(song.sections[0]?.roles[0]?.harmonicExplanation).toContain("tonal floor");
    expect(song.sections[0]?.roles[0]?.transpositionPlan).toContain("whole step lower");
    expect(song.sections[0]?.roles[0]?.tuningPlan).toContain("Tune the E string down to D");
    expect(song.collaboration?.assignments).toHaveLength(2);
    expect(song.collaboration?.comments[0]?.status).toBe("open");
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
    first.collaboration?.assignments.splice(0, 1);

    expect(second).not.toBe(first);
    expect(second.sections).not.toBe(first.sections);
    expect(second.sections[0]?.roles).not.toBe(first.sections[0]?.roles);
    expect(second.sections[0]?.roles[2]?.manualOverrides).toHaveLength(1);
    expect(second.collaboration?.assignments).toHaveLength(2);
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
    parsed.collaboration?.comments.splice(0, 1);

    expect(parsed.sections[0]?.roles).toHaveLength(2);
    expect(song.sections[0]?.roles).toHaveLength(3);
    expect(song.collaboration?.comments).toHaveLength(2);
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

  it("round-trips score attachment metadata and rejects malformed entries", () => {
    const song = createDemoRehearsalSong() as unknown as Record<string, unknown>;
    const attachment = { id: "3f2c8f0e-1a2b-4c3d-8e9f-001122334455", fileName: "opener.pdf" };

    expect(parseRehearsalSong({ ...song, scoreAttachments: [attachment] }).scoreAttachments).toEqual([attachment]);
    expect(parseRehearsalSong({ ...song }).scoreAttachments).toBeUndefined();

    expect(() => parseRehearsalSong({ ...song, scoreAttachments: {} })).toThrow("scoreAttachments");
    expect(() => parseRehearsalSong({ ...song, scoreAttachments: [null] })).toThrow("scoreAttachments[0]");
    expect(() => parseRehearsalSong({
      ...song,
      scoreAttachments: [{ ...attachment, extra: true }]
    })).toThrow("scoreAttachments[0].extra");
    expect(() => parseRehearsalSong({
      ...song,
      scoreAttachments: [{ id: "", fileName: "opener.pdf" }]
    })).toThrow("scoreAttachments[0].id");
    expect(() => parseRehearsalSong({
      ...song,
      scoreAttachments: [{ id: 42, fileName: "opener.pdf" }]
    })).toThrow("scoreAttachments[0].id");
    expect(() => parseRehearsalSong({
      ...song,
      scoreAttachments: [{ id: attachment.id, fileName: "" }]
    })).toThrow("scoreAttachments[0].fileName");
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
    const badCollaborationStatus = createDemoRehearsalSong() as unknown as {
      collaboration: { assignments: Array<{ status: string }> };
    };
    const badRoleExplanation = createDemoRehearsalSong() as unknown as {
      sections: Array<{ roles: Array<{ harmonicExplanation: unknown }> }>;
    };
    const missingId = { ...createDemoRehearsalSong(), id: 42 };
    const sparseSections = createDemoRehearsalSong() as unknown as { sections: RehearsalSong["sections"] };

    roleSparse.sections[0]!.roles = new Array(1);
    badOverride.sections[0]!.roles[2]!.manualOverrides[0]!.value.source = "model";
    badHeadline.exportSummary.headline = 99;
    badFocusSection.exportSummary.focusSections = ["verse", 7];
    badExportSummary.exportSummary = [];
    badCollaborationStatus.collaboration.assignments[0]!.status = "done";
    badRoleExplanation.sections[0]!.roles[0]!.harmonicExplanation = 7;
    sparseSections.sections = new Array(1) as RehearsalSong["sections"];

    expect(() => parseRehearsalSong(roleSparse)).toThrow("sections[0].roles");
    expect(() => parseRehearsalSong(badOverride)).toThrow("manualOverrides[0].value.source");
    expect(() => parseRehearsalSong(badHeadline)).toThrow("exportSummary.headline");
    expect(() => parseRehearsalSong(badFocusSection)).toThrow("exportSummary.focusSections[1]");
    expect(() => parseRehearsalSong(badExportSummary)).toThrow("exportSummary");
    expect(() => parseRehearsalSong(badCollaborationStatus)).toThrow("collaboration.assignments[0].status");
    expect(() => parseRehearsalSong(badRoleExplanation)).toThrow("sections[0].roles[0].harmonicExplanation");
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

  it("validates tempo correctly", () => {
    const validSong = createDemoRehearsalSong();
    expect(isRehearsalSong(validSong)).toBe(true);
    validSong.tempo = 140;
    expect(isRehearsalSong(validSong)).toBe(true);

    const withoutTempo = createDemoRehearsalSong();
    delete withoutTempo.tempo;
    expect(isRehearsalSong(withoutTempo)).toBe(true);
    expect(parseRehearsalSong(withoutTempo)).toEqual(withoutTempo);

    const invalidTempoString = { ...createDemoRehearsalSong(), tempo: "120" };
    expect(() => parseRehearsalSong(invalidTempoString)).toThrow("tempo");

    const invalidTempoZero = { ...createDemoRehearsalSong(), tempo: 0 };
    expect(() => parseRehearsalSong(invalidTempoZero)).toThrow("tempo");

    const invalidTempoNegative = { ...createDemoRehearsalSong(), tempo: -10 };
    expect(() => parseRehearsalSong(invalidTempoNegative)).toThrow("tempo");

    const invalidTempoNaN = { ...createDemoRehearsalSong(), tempo: NaN };
    expect(() => parseRehearsalSong(invalidTempoNaN)).toThrow("tempo");

    const invalidTempoInfinity = { ...createDemoRehearsalSong(), tempo: Infinity };
    expect(() => parseRehearsalSong(invalidTempoInfinity)).toThrow("tempo");
  });

  it("validates practiceProgress successfully when valid", () => {
    const validPracticeProgressSong = createDemoRehearsalSong();
    validPracticeProgressSong.sections[0]!.roles[0]!.practiceProgress = 0;
    expect(isRehearsalSong(validPracticeProgressSong)).toBe(true);
    validPracticeProgressSong.sections[0]!.roles[0]!.practiceProgress = 50;
    expect(isRehearsalSong(validPracticeProgressSong)).toBe(true);
    validPracticeProgressSong.sections[0]!.roles[0]!.practiceProgress = 100;
    expect(isRehearsalSong(validPracticeProgressSong)).toBe(true);
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
        message: "sections[0].roles[0].harmonicExplanation",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.harmonicExplanation = 2 as never;
        })
      },
      {
        message: "sections[0].roles[0].transpositionPlan",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transpositionPlan = 2 as never;
        })
      },
      {
        message: "sections[0].roles[0].tuningPlan",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.tuningPlan = 2 as never;
        })
      },
      {
        message: "sections[0].roles[0].practiceProgress",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.practiceProgress = -1 as never;
        })
      },
      {
        message: "sections[0].roles[0].practiceProgress",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.practiceProgress = 101 as never;
        })
      },
      {
        message: "sections[0].roles[0].practiceProgress",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.practiceProgress = 50.5 as never;
        })
      },
      {
        message: "sections[0].roles[0].practiceProgress",
        payload: createInvalidSong((song) => {
          (song.sections[0]!.roles[0] as unknown as Record<string, unknown>).practiceProgress = "50";
        })
      },
      {
        message: "sections[0].roles[0].transcription",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transcription = "not-an-array" as never;
        })
      },
      {
        message: "sections[0].roles[0].transcription[0]",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transcription = [null as never];
        })
      },
      {
        message: "sections[0].roles[0].transcription[0].extraField",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transcription = [
            { pitch: "E2", onset: 0, offset: 1, velocity: 0.7, extraField: true } as never
          ];
        })
      },
      {
        message: "sections[0].roles[0].transcription[0].pitch",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transcription = [
            { pitch: 42, onset: 0, offset: 1, velocity: 0.7 } as never
          ];
        })
      },
      {
        message: "sections[0].roles[0].transcription[0].onset",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transcription = [
            { pitch: "E2", onset: "0", offset: 1, velocity: 0.7 } as never
          ];
        })
      },
      {
        message: "sections[0].roles[0].transcription[0].offset",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transcription = [
            { pitch: "E2", onset: 0, offset: "1", velocity: 0.7 } as never
          ];
        })
      },
      {
        message: "sections[0].roles[0].transcription[0].velocity",
        payload: createInvalidSong((song) => {
          song.sections[0]!.roles[0]!.transcription = [
            { pitch: "E2", onset: 0, offset: 1, velocity: "loud" } as never
          ];
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
      },
      {
        message: "collaboration.syncMode",
        payload: createInvalidSong((song) => {
          song.collaboration!.syncMode = "shared_drive" as never;
        })
      },
      {
        message: "collaboration",
        payload: createInvalidSong((song) => {
          song.collaboration = null as never;
        })
      },
      {
        message: "collaboration.extraField",
        payload: createInvalidSong((song) => {
          (song.collaboration as unknown as Record<string, unknown>).extraField = true;
        })
      },
      {
        message: "collaboration.syncNote",
        payload: createInvalidSong((song) => {
          song.collaboration!.syncNote = 2 as never;
        })
      },
      {
        message: "collaboration.assignments",
        payload: createInvalidSong((song) => {
          song.collaboration!.assignments = "not-an-array" as never;
        })
      },
      {
        message: "collaboration.assignments[0]",
        payload: createInvalidSong((song) => {
          song.collaboration!.assignments = [null as never];
        })
      },
      {
        message: "collaboration.assignments[0].extraField",
        payload: createInvalidSong((song) => {
          (song.collaboration!.assignments[0] as unknown as Record<string, unknown>).extraField = true;
        })
      },
      {
        message: "collaboration.assignments[0].id",
        payload: createInvalidSong((song) => {
          song.collaboration!.assignments[0]!.id = 2 as never;
        })
      },
      {
        message: "collaboration.assignments[0].assignee",
        payload: createInvalidSong((song) => {
          song.collaboration!.assignments[0]!.assignee = 2 as never;
        })
      },
      {
        message: "collaboration.assignments[0].summary",
        payload: createInvalidSong((song) => {
          song.collaboration!.assignments[0]!.summary = 2 as never;
        })
      },
      {
        message: "collaboration.assignments[0].sectionId",
        payload: createInvalidSong((song) => {
          song.collaboration!.assignments[0]!.sectionId = 2 as never;
        })
      },
      {
        message: "collaboration.assignments[0].roleId",
        payload: createInvalidSong((song) => {
          song.collaboration!.assignments[0]!.roleId = 2 as never;
        })
      },
      {
        message: "collaboration.comments",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments = "not-an-array" as never;
        })
      },
      {
        message: "collaboration.comments[0]",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments = [null as never];
        })
      },
      {
        message: "collaboration.comments[0].extraField",
        payload: createInvalidSong((song) => {
          (song.collaboration!.comments[0] as unknown as Record<string, unknown>).extraField = true;
        })
      },
      {
        message: "collaboration.comments[0].id",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments[0]!.id = 2 as never;
        })
      },
      {
        message: "collaboration.comments[0].author",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments[0]!.author = 2 as never;
        })
      },
      {
        message: "collaboration.comments[0].body",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments[0]!.body = 2 as never;
        })
      },
      {
        message: "collaboration.comments[0].sectionId",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments[0]!.sectionId = 2 as never;
        })
      },
      {
        message: "collaboration.comments[0].roleId",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments[0]!.roleId = 2 as never;
        })
      },
      {
        message: "collaboration.comments[0].status",
        payload: createInvalidSong((song) => {
          song.collaboration!.comments[0]!.status = "pending" as never;
        })
      },
      {
        message: "collaboration.approvals",
        payload: createInvalidSong((song) => {
          song.collaboration!.approvals = "not-an-array" as never;
        })
      },
      {
        message: "collaboration.approvals[0]",
        payload: createInvalidSong((song) => {
          song.collaboration!.approvals = [null as never];
        })
      },
      {
        message: "collaboration.approvals[0].extraField",
        payload: createInvalidSong((song) => {
          (song.collaboration!.approvals[0] as unknown as Record<string, unknown>).extraField = true;
        })
      },
      {
        message: "collaboration.approvals[0].id",
        payload: createInvalidSong((song) => {
          song.collaboration!.approvals[0]!.id = 2 as never;
        })
      },
      {
        message: "collaboration.approvals[0].scope",
        payload: createInvalidSong((song) => {
          song.collaboration!.approvals[0]!.scope = 2 as never;
        })
      },
      {
        message: "collaboration.approvals[0].owner",
        payload: createInvalidSong((song) => {
          song.collaboration!.approvals[0]!.owner = 2 as never;
        })
      },
      {
        message: "collaboration.approvals[0].status",
        payload: createInvalidSong((song) => {
          song.collaboration!.approvals[0]!.status = "waiting" as never;
        })
      }
    ];

    for (const testCase of cases) {
      expect(() => parseRehearsalSong(testCase.payload)).toThrow(testCase.message);
    }

    const songWithTranscription = createDemoRehearsalSong();
    songWithTranscription.sections[0]!.roles[0]!.transcription = [
      { pitch: "E2", onset: 0, offset: 1, velocity: 0.7 }
    ];
    expect(parseRehearsalSong(songWithTranscription).sections[0]?.roles[0]?.transcription).toEqual([
      { pitch: "E2", onset: 0, offset: 1, velocity: 0.7 }
    ]);
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
    const queuedPack: SongRehearsalPack = {
      id: "pack-queued",
      packState: "queued",
      engineState: "queued",
      sourceLabel: "Queued Song"
    };
    const analyzingPack: SongRehearsalPack = {
      id: "pack-analyzing",
      packState: "analyzing",
      engineState: "running",
      sourceLabel: "Analyzing Song"
    };
    const failedPack: SongRehearsalPack = {
      id: "pack-failed",
      packState: "failed",
      engineState: "failed",
      sourceLabel: "Failed Song",
      error: { code: "engine_unavailable", message: "Engine unavailable" }
    };

    expect(parseSongRehearsalPack(validPack)).toEqual(validPack);
    expect(parseSongRehearsalPack(queuedPack)).toEqual(queuedPack);
    expect(parseSongRehearsalPack(analyzingPack)).toEqual(analyzingPack);
    expect(parseSongRehearsalPack(failedPack)).toEqual(failedPack);
    expect(isRehearsalWorkspace(validWorkspace)).toBe(true);
    expect(parseRehearsalWorkspace(validWorkspace)).toEqual(validWorkspace);
    expect(parseRehearsalWorkspace({
      ...validWorkspace,
      songs: [queuedPack, failedPack]
    })).toEqual({
      ...validWorkspace,
      songs: [queuedPack, failedPack]
    });

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
    expect(() => parseSongRehearsalPack({
      id: "pack-ready-missing-song",
      packState: "ready",
      sourceLabel: "Ready Song"
    })).toThrow("song");
    expect(() => parseSongRehearsalPack({ ...queuedPack, extraField: true })).toThrow("extraField");
    expect(() => parseSongRehearsalPack({
      id: "pack-queued-missing-engine",
      packState: "queued",
      sourceLabel: "Queued Song"
    })).toThrow("engineState");
    expect(() => parseSongRehearsalPack({ ...failedPack, extraField: true })).toThrow("extraField");
    expect(() => parseSongRehearsalPack({
      id: "pack-failed-missing-error",
      packState: "failed",
      sourceLabel: "Failed Song"
    })).toThrow("error");
    
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
});
