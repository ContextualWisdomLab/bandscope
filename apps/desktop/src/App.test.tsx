import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const tauriInvoke = vi.fn();
const mockLoadProject = vi.fn();
const mockSaveProject = vi.fn();
const mockSubscribeToAnalysisJobUpdates = vi.fn();
let mockImportYoutubeUrlError = false;
let latestStatusSubscription: ((payload: Record<string, unknown>) => void) | null = null;

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const tauriWindow = window as TauriWindow;

vi.mock("./lib/analysis", async (importActual) => {
  const actual = await importActual<typeof import("./lib/analysis")>();

  return {
    ...actual,
    importYoutubeUrl: async (url: string) => {
      if (mockImportYoutubeUrlError) {
        throw new Error("Simulated component crash");
      }
      return actual.importYoutubeUrl(url);
    },
    createDefaultAnalysisRequest: () => ({
      sourceKind: "demo",
      sourceLabel: "Late Night Set",
      roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
    }),
    subscribeToAnalysisJobUpdates: (...args: Parameters<typeof mockSubscribeToAnalysisJobUpdates>) =>
      mockSubscribeToAnalysisJobUpdates(...args),
    loadProject: () => mockLoadProject(),
    saveProject: (song: unknown) => mockSaveProject(song)
  };
});

function succeededResult() {
  return {
    jobId: "job-1",
    state: "succeeded",
    requestedAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:01.000Z",
    progressLabel: "Analysis ready",
    result: {
      id: "demo-song",
      title: "Late Night Set",
      sections: [
        {
          id: "verse-1",
          label: "verse",
          groove: "Straight eighths with a late snare feel",
          timeRange: { start: 10, end: 30 },
          confidence: {
            level: "medium",
            source: "model",
            notes: "Double-check the pickup into the chorus."
          },
          roles: [
            {
              id: "bass-guitar",
              name: "Bass Guitar",
              roleType: "instrument",
              harmony: {
                chord: "C#m7",
                functionLabel: "vi pedal anchor",
                source: "model"
              },
              cue: { kind: "transition", value: "Hold through the pickup before the downbeat." },
              range: { lowestNote: "C#2", highestNote: "E3" },
              confidence: { level: "medium", source: "model", notes: "Watch the slide into the turnaround." },
              rehearsalPriority: "high",
              simplification: "Stay on roots if the chorus entrance gets muddy.",
              setupNote: "Keep the attack short so the verse breathes.",
              manualOverrides: [],
              overlapWarnings: [
                "Density warning: competing with Keyboard Left Hand in low register."
              ]
            },
            {
              id: "lead-vocal",
              name: "Lead Vocal",
              roleType: "vocal",
              harmony: {
                chord: "C#m7",
                functionLabel: "vi melodic pull",
                source: "model"
              },
              cue: { kind: "lyric", value: "city lights" },
              range: { lowestNote: "G#3", highestNote: "C#5" },
              confidence: { level: "high", source: "user", notes: "Singer confirmed the pickup phrasing in rehearsal notes." },
              rehearsalPriority: "medium",
              simplification: "Keep the sustained note centered; skip the ad-lib on the first pass.",
              setupNote: "Watch the breath before the last line of the verse.",
              manualOverrides: [
                {
                  field: "harmony",
                  value: {
                    chord: "C#m11",
                    functionLabel: "vi suspended lift",
                    source: "user"
                  },
                  source: "user"
                }
              ],
              overlapWarnings: []
            }
          ],
          partGraph: [
            { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
            { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: ["bass-guitar"] }
          ]
        }
      ],
      exportSummary: {
        format: "cue-sheet",
        headline: "Start with verse entrances before the chorus lift.",
        focusSections: ["verse"]
      }
    }
  };
}

function bootstrapResponse(overrides: Record<string, unknown> = {}) {
  const source = {
    sourcePath: "/Users/test/Music/late-night-set.wav",
    fileName: "late-night-set.wav",
    extension: "wav",
    fileSizeBytes: 1024000
  };
  const { source: sourceOverride, ...restOverrides } = overrides;

  return {
    projectId: "project-1",
    sourceMode: "reference",
    projectRoot: "/tmp/bandscope/projects/project-1",
    cacheRoot: "/tmp/bandscope/cache/project-1",
    tempRoot: "/tmp/bandscope/temp/project-1",
    ...restOverrides,
    source: {
      ...source,
      ...((sourceOverride as Record<string, unknown> | undefined) ?? {})
    }
  };
}

function jobStatusResponse(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "job-1",
    state: "queued",
    requestedAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
    progressLabel: "Queued for analysis",
    ...overrides
  };
}

function failedJobStatus(jobId: string, message: string) {
  return jobStatusResponse({
    jobId,
    state: "failed",
    error: {
      code: "engine_unavailable",
      message
    }
  });
}

describe("App", () => {
  beforeEach(() => {
    tauriInvoke.mockReset();
    mockLoadProject.mockReset();
    mockSaveProject.mockReset();
    mockSubscribeToAnalysisJobUpdates.mockReset();
    mockImportYoutubeUrlError = false;
    latestStatusSubscription = null;
    mockSubscribeToAnalysisJobUpdates.mockImplementation(
      async (_jobId: string, onUpdate: (status: Record<string, unknown>) => void) => {
        latestStatusSubscription = onUpdate;
        return () => {
          latestStatusSubscription = null;
        };
      }
    );
    delete tauriWindow.__TAURI_INTERNALS__;
    tauriWindow.__TAURI_INVOKE__ = tauriInvoke;
  });

  it("renders the rehearsal cockpit shell before analysis starts", () => {
    render(<App />);

    expect(screen.getByRole("img", { name: /BandScope circular equalizer mark/i })).toBeTruthy();
    expect(screen.getByText(/Your rehearsal map stays on this device/i)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: /primary rehearsal views/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Workspace Home/i })).toBeTruthy();
    expect(screen.getByText(/SYNCED • LOCAL/i)).toBeTruthy();
    expect(screen.getByText(/Turn a song into a practical rehearsal view\./i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Workspace$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Import$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Export$/i })).toBeTruthy();
    expect(screen.getByText(/^Tempo$/i)).toBeTruthy();
    expect(screen.getByText(/^Key$/i)).toBeTruthy();
    expect(screen.getByText(/Local-first/i)).toBeTruthy();
    expect(screen.getByText(/Project files stay local/i)).toBeTruthy();
    expect(screen.getByText(/YouTube only leaves the app when you choose import/i)).toBeTruthy();
  });

  it("renders the loaded song as a dark rehearsal command board", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Song Timeline/i)).toBeTruthy();
    });
    expect(screen.getByText(/Roles & Harmony/i)).toBeTruthy();
    expect(screen.getByText(/Stems/i)).toBeTruthy();
    expect(screen.getByText(/Rehearsal Priorities/i)).toBeTruthy();
    expect(screen.getByText(/Export Cue Sheet/i)).toBeTruthy();
  });

  it("renders a rehearsal song structure timeline from real section ranges", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Song Structure/i })).toBeTruthy();
    });
    expect(screen.getByText(/verse · 0:10–0:30/i)).toBeTruthy();
    expect(screen.getByText(/Rehearsal timeline/i)).toBeTruthy();
    expect(screen.queryByText(/Mock-board/i)).toBeNull();
    const timelineRegion = screen.getByRole("region", { name: /scrollable song structure timeline/i });
    expect(timelineRegion.className).toContain("overflow-x-auto");
    expect(timelineRegion.getAttribute("tabindex")).toBe("0");
    expect(screen.queryByLabelText(/decorative waveform overview/i)).toBeNull();
  });

  it("does not show unavailable analysis metrics as detected facts", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    expect(screen.queryByText(/128 BPM/i)).toBeNull();
    expect(screen.queryByText(/E Major/i)).toBeNull();
    expect(screen.queryByText(/86%/i)).toBeNull();
    expect(screen.queryByText(/entry, dropout/i)).toBeNull();
    expect(screen.queryByText(/Preview-ready lanes/i)).toBeNull();
    expect(screen.getAllByText(/Pending/i).length).toBeGreaterThanOrEqual(2);
  });

  it("summarizes confidence from the lowest-confidence loaded section", async () => {
    const loadedProject = succeededResult().result;
    loadedProject.sections.push({
      ...loadedProject.sections[0],
      id: "chorus-1",
      label: "chorus",
      confidence: { level: "high", source: "model", notes: "The chorus form is clear." }
    });
    mockLoadProject.mockResolvedValueOnce(loadedProject);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Medium$/i)).toBeTruthy();
    });
    expect(screen.getAllByText(/2 sections/i).length).toBeGreaterThan(0);
  });

  it("selects a local audio source and starts a local-audio analysis job", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-local-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }))
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenNthCalledWith(2, "start_analysis_job", {
        request: {
          sourceKind: "local_audio",
          projectId: "project-1",
          sourceLabel: "late-night-set.wav",
          roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
        }
      });
    });
  });

  it("shows a safe file-intake error for unsupported local audio selection", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("Choose a WAV, MP3, FLAC, or M4A file to start analysis."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/choose a wav, mp3, flac, or m4a file/i)).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/choose a wav, mp3, flac, or m4a file/i);
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("falls back to generic local-audio error copy when selection omits a message", async () => {
    tauriInvoke.mockRejectedValueOnce({
      code: "unsupported_file"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/choose a wav, mp3, flac, or m4a file/i)).toBeTruthy();
    });
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("preserves safe file-read failure copy from the intake bridge", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("Could not read the selected audio file."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not read the selected audio file/i)).toBeTruthy();
    });
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("starts an analysis job and renders the returned rehearsal result", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }))
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/queued for analysis/i)).toBeTruthy();
    });
    expect(screen.getAllByRole("status").some((status) => /queued for analysis/i.test(status.textContent ?? ""))).toBe(true);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    expect(screen.getAllByText(/Bass Guitar/i).length).toBeGreaterThan(0);
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, "start_analysis_job", {
      request: {
        sourceKind: "local_audio",
        projectId: "project-1",
        sourceLabel: "late-night-set.wav",
        roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
      }
    });
  });

  it("shows the engine stage label and accessible progress value while analysis runs", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-progress-1",
        state: "running",
        progressLabel: "Separating stems... (45%)",
        progressStage: "separate",
        progressPercent: 45,
        cacheStatus: "miss"
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/separating stems/i)).toBeTruthy();
    });
    expect(screen.getByRole("progressbar", { name: /analysis progress/i })).toHaveAttribute(
      "aria-valuenow",
      "45"
    );
  });

  it("applies pushed analysis status updates over the IPC event bridge", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-push-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => {
      expect(screen.getByText(/queued for analysis/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(mockSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith(
        "job-push-1",
        expect.any(Function)
      );
    });

    latestStatusSubscription?.(
      jobStatusResponse({
        jobId: "job-push-1",
        state: "running",
        progressLabel: "Separating stems... (45%)",
        progressStage: "separate",
        progressPercent: 45
      })
    );
    await waitFor(() => {
      expect(screen.getByText(/separating stems/i)).toBeTruthy();
    });

    latestStatusSubscription?.(succeededResult());
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
  });

  it("keeps handoff metadata tied to the source that produced the current result", async () => {
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const createObjectUrl = vi.fn(() => "blob:handoff");
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });

    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-1",
        state: "queued",
        progressLabel: "Queued for analysis"
      }))
      .mockResolvedValueOnce(succeededResult())
      .mockResolvedValueOnce(
        bootstrapResponse({
          projectId: "project-2",
          source: {
            sourcePath: "/Users/test/Music/next-song.wav",
            fileName: "next-song.wav",
            fileSizeBytes: 2048000
          }
        })
      );

    try {
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
      await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

      fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
      });

      fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
      await waitFor(() => expect(screen.getByText(/next-song\.wav/i)).toBeTruthy());

      fireEvent.click(screen.getByRole("button", { name: /export handoff/i }));
      const blob = createObjectUrl.mock.calls[0]?.[0] as Blob;
      const payload = JSON.parse(await blob.text());

      expect(payload.sourceAssets[0].fileName).toBe("late-night-set.wav");
      expect(JSON.stringify(payload)).not.toContain("next-song.wav");
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:handoff");
    } finally {
      click.mockRestore();
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl
      });
    }
  });

  it("shows a safe failed status when the job poll returns an error", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-2",
        state: "running",
        progressLabel: "Running analysis"
      }))
      .mockResolvedValueOnce(failedJobStatus("job-2", "Analysis engine is unavailable."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis engine is unavailable/i)).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/analysis engine is unavailable/i);
  });

  it("falls back to a generic failure message when the engine omits details", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-3",
        state: "running",
        progressLabel: "Running analysis"
      }))
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-3",
        state: "failed",
        error: { code: "engine_unavailable" }
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("keeps polling the active job when one polling request rejects", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-4",
        state: "running",
        progressLabel: "Running analysis"
      }))
      .mockRejectedValueOnce(new Error("transport down"))
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledTimes(3);
    });
    expect(screen.queryByText(/analysis could not start/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: /start analysis/i }).hasAttribute("disabled")).toBe(true);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
  });

  it("shows a generic failure when starting the job rejects", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockRejectedValueOnce(new Error("invoke failed"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("shows the direct failure message when start returns a failed job", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(failedJobStatus("job-5", "Analysis queue is full. Please wait for a running job to finish."));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis queue is full/i)).toBeTruthy();
    });
  });

  it("falls back to generic text when start returns a failed job without details", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(jobStatusResponse({
        jobId: "job-6",
        state: "failed"
      }));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/analysis could not start/i).length).toBeGreaterThan(0);
    });
  });

  it("renders the result immediately when start returns a succeeded job", async () => {
    tauriInvoke
      .mockResolvedValueOnce(bootstrapResponse())
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/Section Roadmap/i)).toBeTruthy();
    });
    expect(tauriInvoke).toHaveBeenCalledTimes(2); // select + start
  });

  it("imports a YouTube URL successfully", async () => {
    tauriInvoke.mockResolvedValueOnce({
      projectId: "project-yt-1",
      sourceMode: "reference",
      projectRoot: "/tmp/bandscope/projects/project-yt-1",
      cacheRoot: "/tmp/bandscope/cache/project-yt-1",
      tempRoot: "/tmp/bandscope/temp/project-yt-1",
      source: {
        sourcePath: "/tmp/bandscope/temp/project-yt-1/youtube.wav",
        fileName: "youtube.wav",
        extension: "wav",
        fileSizeBytes: 5000000
      }
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("import_youtube_url", {
        url: "https://youtube.com/watch?v=abc123DEF45"
      });
      expect(screen.getByText(/youtube\.wav/i)).toBeTruthy();
    });
  });

  it("handles YouTube import failure with a message", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("This video is age restricted."));

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=def456GHI78" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/This video is age restricted/i)).toBeTruthy();
    });
  });

  it("handles generic exception during YouTube import", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("Network Error"));

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=ghi789JKL01" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Network Error/i)).toBeTruthy();
    });
  });

  it("rejects empty YouTube URL", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "   " } });
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    // Button is disabled if youtubeUrl is empty, but we simulate enabling it for coverage
    // or we can test that the error is set when it somehow triggers, but actually it's disabled.
    // Wait, the button is disabled if `!youtubeUrl`. `youtubeUrl` is "   ", so button is NOT disabled!
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("rejects malformed YouTube URL", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "not-a-url" } });
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("rejects non-http YouTube URL", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "ftp://youtube.com/watch?v=abc123DEF45" } });
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("rejects non-allowlisted YouTube URL intake before invoking the bridge", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://example.com/watch?v=abc123DEF45" } });

    fireEvent.click(screen.getByRole("button", { name: /Import YouTube/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("rejects downgraded YouTube URL intake before invoking the bridge", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "http://youtube.com/watch?v=abc123DEF45" } });

    fireEvent.click(screen.getByRole("button", { name: /Import YouTube/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("rejects duplicate YouTube video parameters even when one is blank", async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45&v=" } });

    fireEvent.click(screen.getByRole("button", { name: /Import YouTube/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
    expect(tauriInvoke).not.toHaveBeenCalled();
  });


  it("loads a project and updates the UI", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });
    expect(mockLoadProject).toHaveBeenCalledTimes(1);
  });

  it("handles loading a project failure safely", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("Corrupt file"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load project: Corrupt file/i)).toBeTruthy();
    });
  });

  it("ignores cancellation when loading a project", async () => {
    mockLoadProject.mockRejectedValueOnce(new Error("User cancelled"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    // Should not show error, should remain in empty state
    await waitFor(() => {
      expect(mockLoadProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load project/i)).toBeNull();
    });
  });

  it("handles loading a project failure with string error gracefully", async () => {
    mockLoadProject.mockRejectedValueOnce("Unknown load error");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load project: Unknown load error/i)).toBeTruthy();
    });
  });

  it("ignores cancellation when loading a project with string error", async () => {
    mockLoadProject.mockRejectedValueOnce("User cancelled");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));

    await waitFor(() => {
      expect(mockLoadProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load project/i)).toBeNull();
    });
  });

  it("saves a project successfully", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockResolvedValueOnce(undefined);

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledWith(succeededResult().result);
    });
  });

  it("handles saving a project failure gracefully", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce(new Error("Permission denied"));

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to save project: Permission denied/i)).toBeTruthy();
    });
  });

  it("ignores cancellation when saving a project with Error object", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce(new Error("User cancelled"));

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to save project/i)).toBeNull();
    });
  });

  it("handles saving a project failure with string error gracefully", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce("Disk full");

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to save project: Disk full/i)).toBeTruthy();
    });
  });

  it("ignores cancellation when saving a project with string error", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    mockSaveProject.mockRejectedValueOnce("User cancelled");

    // Now click save
    fireEvent.click(screen.getByRole("button", { name: /save project/i }));

    await waitFor(() => {
      expect(mockSaveProject).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Failed to save project/i)).toBeNull();
    });
  });

  it("handles song update from workspace", async () => {
    mockLoadProject.mockResolvedValueOnce(succeededResult().result);
    render(<App />);

    // Load first to get jobResult populated
    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    // Mock prompt to simulate user entering a new chord
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Dbmaj7");

    // Click on the chord to edit it (assuming SectionRoadmap renders it and allows click to edit)
    fireEvent.click(screen.getAllByText("C#m7", { selector: 'button' })[0]);

    // Wait for the UI to update with the new chord (which verifies handleSongUpdate was called and state updated)
    await waitFor(() => {
      expect(screen.getAllByText("Dbmaj7").length).toBeGreaterThan(0);
    });

    promptSpy.mockRestore();
  });

  it("handles YouTube import failure with a missing message falling back to generic", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error(""));

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=def456GHI78" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

  it("does nothing when Save Project is clicked but there is no jobResult", () => {
    render(<App />);
    const saveButton = screen.getByRole("button", { name: /save project/i });
    // Remove disabled attribute to force the click for coverage
    saveButton.removeAttribute("disabled");
    fireEvent.click(saveButton);
    expect(mockSaveProject).not.toHaveBeenCalled();
  });

  it("handles exception thrown by importYoutubeUrl itself", async () => {
    mockImportYoutubeUrlError = true;

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=crashing123" } });

    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });
});
