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
  startAnalysisJob: (request: unknown) => tauriInvoke("start_analysis_job", { request }),
  getAnalysisJobStatus: (jobId: string) => tauriInvoke("get_analysis_job_status", { jobId })
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

  it("starts an analysis job and renders the returned rehearsal result", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        jobId: "job-1",
        state: "queued",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        progressLabel: "Queued for analysis"
      })
      .mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/queued for analysis/i)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Late Night Set/i })).toBeTruthy();
    });

    expect(screen.getByText(/Bass Guitar/i)).toBeTruthy();
    expect(tauriInvoke).toHaveBeenNthCalledWith(1, "start_analysis_job", {
      request: {
        sourceKind: "demo",
        sourceLabel: "Late Night Set",
        roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
      }
    });
    expect(tauriInvoke).toHaveBeenNthCalledWith(2, "get_analysis_job_status", {
      jobId: "job-1"
    });
  });

  it("shows a safe failed status when the job poll returns an error", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        jobId: "job-2",
        state: "running",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        progressLabel: "Running analysis"
      })
      .mockResolvedValueOnce({
        jobId: "job-2",
        state: "failed",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:01.000Z",
        error: {
          code: "engine_unavailable",
          message: "Analysis engine is unavailable."
        }
      });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis engine is unavailable/i)).toBeTruthy();
    });
  });

  it("falls back to a generic failure message when the engine omits details", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        jobId: "job-3",
        state: "running",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        progressLabel: "Running analysis"
      })
      .mockResolvedValueOnce({
        jobId: "job-3",
        state: "failed",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:01.000Z",
        error: {
          code: "engine_unavailable"
        }
      });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/analysis could not start/i)).toHaveLength(2);
    });
  });

  it("shows a generic failure when polling rejects", async () => {
    tauriInvoke
      .mockResolvedValueOnce({
        jobId: "job-4",
        state: "running",
        requestedAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
        progressLabel: "Running analysis"
      })
      .mockRejectedValueOnce(new Error("transport down"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("shows a generic failure when starting the job rejects", async () => {
    tauriInvoke.mockRejectedValueOnce(new Error("invoke failed"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis could not start/i)).toBeTruthy();
    });
  });

  it("shows the direct failure message when start returns a failed job", async () => {
    tauriInvoke.mockResolvedValueOnce({
      jobId: "job-5",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z",
      error: {
        code: "engine_unavailable",
        message: "Analysis queue is full. Please wait for a running job to finish."
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/analysis queue is full/i)).toBeTruthy();
    });
  });

  it("falls back to generic text when start returns a failed job without details", async () => {
    tauriInvoke.mockResolvedValueOnce({
      jobId: "job-6",
      state: "failed",
      requestedAt: "2026-03-12T00:00:00.000Z",
      updatedAt: "2026-03-12T00:00:00.000Z"
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/analysis could not start/i).length).toBeGreaterThan(0);
    });
  });

  it("renders the result immediately when start returns a succeeded job", async () => {
    tauriInvoke.mockResolvedValueOnce(succeededResult());

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText(/manual override: C#m11 \(User-confirmed\)/i)).toBeTruthy();
    });
    expect(tauriInvoke).toHaveBeenCalledTimes(1);
  });
});
