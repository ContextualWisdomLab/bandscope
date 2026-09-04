import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const analysisMocks = vi.hoisted(() => ({
  selectLocalAudioSource: vi.fn(),
  startAnalysisJob: vi.fn()
}));

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div>Score view</div>
}));

vi.mock("./lib/analysis", () => ({
  MAX_YOUTUBE_URL_LENGTH: 2000,
  createDefaultAnalysisRequest: () => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
  }),
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: () => false,
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: analysisMocks.selectLocalAudioSource,
  startAnalysisJob: analysisMocks.startAnalysisJob,
  subscribeToAnalysisJobUpdates: vi.fn().mockResolvedValue(() => undefined)
}));

const admittedBootstrap = {
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
};

describe("analysis failure recovery cancellation", () => {
  beforeEach(() => {
    analysisMocks.selectLocalAudioSource.mockReset();
    analysisMocks.startAnalysisJob.mockReset();
  });

  it("keeps the admitted song and recovery actions when the replacement picker is cancelled", async () => {
    analysisMocks.selectLocalAudioSource
      .mockResolvedValueOnce({ ok: true, bootstrap: admittedBootstrap })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "invalid_request", message: "User cancelled" }
      });
    analysisMocks.startAnalysisJob.mockResolvedValue({
      jobId: "job-1",
      state: "failed",
      requestedAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:01.000Z",
      error: {
        code: "engine_unavailable",
        message: "Analysis engine is unavailable."
      }
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /choose another song/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /choose another song/i }));
    await waitFor(() => expect(analysisMocks.selectLocalAudioSource).toHaveBeenCalledTimes(2));

    expect(screen.queryByText(/user cancelled/i)).toBeNull();
    expect(screen.queryByText(/choose a wav, mp3, flac, or m4a file/i)).toBeNull();
    expect(screen.getByText(/late-night-set\.wav/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try this song again/i }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: /choose another song/i }).hasAttribute("disabled")).toBe(false);
  });
});
