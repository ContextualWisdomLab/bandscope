import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const tauriInvoke = vi.fn();

vi.mock("./lib/analysis", () => ({
  createDefaultAnalysisRequest: () => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
  }),
  selectLocalAudioSource: async () => {
    const response = await tauriInvoke("select_local_audio_source", undefined);
    if (response?.code) {
      return { ok: false, error: response };
    }

    return { ok: true, bootstrap: response };
  },
  startAnalysisJob: (request: unknown) => tauriInvoke("start_analysis_job", { request }),
  getAnalysisJobStatus: (jobId: string) => tauriInvoke("get_analysis_job_status", { jobId }),
  importYoutubeUrl: async (url: string) => {
    const response = await tauriInvoke("import_youtube_url", { url });
    if (response?.code) {
      return { ok: false, error: response };
    }
    return { ok: true, bootstrap: response };
  }
}));

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
          label: "Verse 1",
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
              manualOverrides: []
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
              overlapWarnings: [{ targetRoleId: "keys-right", severity: "high", description: "Clash" }],
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
              ]
            }
          ]
        }
      ],
      exportSummary: {
        format: "cue-sheet",
        headline: "Start with Verse 1 entrances before the chorus lift.",
        focusSections: ["Verse 1"]
      }
    }
  };
}

describe("App", () => {
  beforeEach(() => {
    tauriInvoke.mockReset();
  });

  it("selects a local audio source and starts a local-audio analysis job", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        projectRoot: "/tmp/bandscope/projects/project-1",
        cacheRoot: "/tmp/bandscope/cache/project-1",
        tempRoot: "/tmp/bandscope/temp/project-1",
        source: {
          sourcePath: "/Users/test/Music/late-night-set.wav",
          fileName: "late-night-set.wav",
          extension: "wav",
          fileSizeBytes: 1024000
        }
      })
      .mockResolvedValueOnce({
        jobId: "job-local-1",
        state: "queued",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        progressLabel: "Queued for analysis"
      })
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
    tauriInvoke.mockResolvedValueOnce({
      code: "unsupported_file",
      message: "Choose a WAV, MP3, FLAC, or M4A file to start analysis."
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/choose a wav, mp3, flac, or m4a file/i)).toBeTruthy();
    });
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("falls back to generic local-audio error copy when selection omits a message", async () => {
    tauriInvoke.mockResolvedValueOnce({
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
    tauriInvoke.mockResolvedValueOnce({
      code: "invalid_request",
      message: "Could not read the selected audio file."
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not read the selected audio file/i)).toBeTruthy();
    });
    expect(screen.queryByText(/analysis failed during execution/i)).toBeNull();
  });

  it("starts an analysis job and renders the returned rehearsal result", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        projectRoot: "/tmp/bandscope/projects/project-1",
        cacheRoot: "/tmp/bandscope/cache/project-1",
        tempRoot: "/tmp/bandscope/temp/project-1",
        source: {
          sourcePath: "/Users/test/Music/late-night-set.wav",
          fileName: "late-night-set.wav",
          extension: "wav",
          fileSizeBytes: 1024000
        }
      })
      .mockResolvedValueOnce({
        jobId: "job-1",
        state: "queued",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        progressLabel: "Queued for analysis"
      })
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

  it("shows a safe failed status when the job poll returns an error", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        source: { fileName: "late-night-set.wav" }
      })
      .mockResolvedValueOnce({
        jobId: "job-2",
        state: "running"
      })
      .mockResolvedValueOnce({
        jobId: "job-2",
        state: "failed",
        error: { message: "Analysis engine is unavailable." }
      });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis engine is unavailable/i)).toBeTruthy();
    });
  });

  it("falls back to a generic failure message when the engine omits details", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        source: { fileName: "late-night-set.wav" }
      })
      .mockResolvedValueOnce({
        jobId: "job-3",
        state: "running"
      })
      .mockResolvedValueOnce({
        jobId: "job-3",
        state: "failed",
        error: { code: "engine_unavailable" }
      });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("shows a generic failure when polling rejects", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        source: { fileName: "late-night-set.wav" }
      })
      .mockResolvedValueOnce({
        jobId: "job-4",
        state: "running"
      })
      .mockRejectedValueOnce(new Error("transport down"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("shows a generic failure when starting the job rejects", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        source: { fileName: "late-night-set.wav" }
      })
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
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        source: { fileName: "late-night-set.wav" }
      })
      .mockResolvedValueOnce({
        jobId: "job-5",
        state: "failed",
        error: { message: "Analysis queue is full. Please wait for a running job to finish." }
      });

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
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        source: { fileName: "late-night-set.wav" }
      })
      .mockResolvedValueOnce({
        jobId: "job-6",
        state: "failed"
      });

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
      .mockResolvedValueOnce({
        projectId: "project-1",
        sourceMode: "reference",
        source: { fileName: "late-night-set.wav" }
      })
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
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=123" } });
    
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(tauriInvoke).toHaveBeenCalledWith("import_youtube_url", { url: "https://youtube.com/watch?v=123" });
      expect(screen.getByText(/youtube\.wav/i)).toBeTruthy();
    });
  });

  it("handles YouTube import failure with a message", async () => {
    tauriInvoke.mockResolvedValueOnce({
      code: "youtube_import_failed",
      message: "This video is age restricted."
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/YouTube URL.../i);
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=456" } });
    
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
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=789" } });
    
    const button = screen.getByRole("button", { name: /Import YouTube/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Failed to import YouTube URL./i)).toBeTruthy();
    });
  });

});
