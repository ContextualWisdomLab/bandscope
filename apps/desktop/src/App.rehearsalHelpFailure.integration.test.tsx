import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const analysisMocks = vi.hoisted(() => ({
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: vi.fn(),
  startAnalysisJob: vi.fn(),
  subscribeToAnalysisJobUpdates: vi.fn(async () => () => undefined),
}));

vi.mock("./lib/analysis", () => ({
  createDefaultAnalysisRequest: () => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["bass-guitar", "keys-right", "lead-vocal"],
  }),
  getAnalysisJobStatus: analysisMocks.getAnalysisJobStatus,
  importYoutubeUrl: analysisMocks.importYoutubeUrl,
  isSupportedYoutubeUrl: () => false,
  loadProject: analysisMocks.loadProject,
  MAX_YOUTUBE_URL_LENGTH: 2048,
  saveProject: analysisMocks.saveProject,
  selectLocalAudioSource: analysisMocks.selectLocalAudioSource,
  startAnalysisJob: analysisMocks.startAnalysisJob,
  subscribeToAnalysisJobUpdates: analysisMocks.subscribeToAnalysisJobUpdates,
}));

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => null,
}));

function bootstrap(projectId: string, fileName: string) {
  return {
    projectId,
    sourceMode: "reference",
    projectRoot: `/tmp/bandscope/projects/${projectId}`,
    cacheRoot: `/tmp/bandscope/cache/${projectId}`,
    tempRoot: `/tmp/bandscope/temp/${projectId}`,
    source: {
      sourcePath: `/Users/test/Music/${fileName}`,
      fileName,
      extension: "wav",
      fileSizeBytes: 1024000,
    },
  };
}

describe("App rehearsal-help failure recovery", () => {
  beforeEach(() => {
    for (const mock of Object.values(analysisMocks)) {
      mock.mockReset();
    }
    analysisMocks.subscribeToAnalysisJobUpdates.mockResolvedValue(() => undefined);
  });

  it("advances from retry to start analysis after a different local song is selected", async () => {
    analysisMocks.selectLocalAudioSource
      .mockResolvedValueOnce({ ok: true, bootstrap: bootstrap("project-a", "failed-song.wav") })
      .mockResolvedValueOnce({ ok: true, bootstrap: bootstrap("project-b", "fresh-song.wav") });
    analysisMocks.startAnalysisJob.mockResolvedValueOnce({
      jobId: "job-help-failed",
      state: "failed",
      requestedAt: "2026-08-21T05:00:00.000Z",
      updatedAt: "2026-08-21T05:00:01.000Z",
      error: {
        code: "engine_unavailable",
        message: "Analysis engine is unavailable.",
      },
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/failed-song\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/analysis engine is unavailable/i);
    });

    fireEvent.click(screen.getByRole("button", { name: /open rehearsal help/i }));
    let helpDialog = screen.getByTestId("rehearsal-help-dialog");
    expect(within(helpDialog).getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /choose another local song and try again/i,
    );
    fireEvent.click(within(helpDialog).getByRole("button", { name: /choose another song/i }));

    await waitFor(() => expect(screen.getByText(/fresh-song\.wav/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /open rehearsal help/i }));
    helpDialog = screen.getByTestId("rehearsal-help-dialog");

    expect(within(helpDialog).getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /start analysis to get tonight's first cues/i,
    );
    expect(within(helpDialog).queryByRole("button", { name: /choose another song/i })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
