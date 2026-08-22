import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const mocks = vi.hoisted(() => ({
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: vi.fn(),
  startAnalysisJob: vi.fn(),
  subscribeToAnalysisJobUpdates: vi.fn()
}));

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => null
}));

vi.mock("./lib/analysis", () => ({
  MAX_YOUTUBE_URL_LENGTH: 2000,
  createDefaultAnalysisRequest: () => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
  }),
  getAnalysisJobStatus: mocks.getAnalysisJobStatus,
  importYoutubeUrl: mocks.importYoutubeUrl,
  isSupportedYoutubeUrl: () => true,
  loadProject: mocks.loadProject,
  saveProject: mocks.saveProject,
  selectLocalAudioSource: mocks.selectLocalAudioSource,
  startAnalysisJob: mocks.startAnalysisJob,
  subscribeToAnalysisJobUpdates: mocks.subscribeToAnalysisJobUpdates
}));

const localBootstrap = {
  projectId: "project-local-1",
  sourceMode: "reference",
  projectRoot: "/tmp/bandscope/projects/project-local-1",
  cacheRoot: "/tmp/bandscope/cache/project-local-1",
  tempRoot: "/tmp/bandscope/temp/project-local-1",
  source: {
    sourcePath: "/tmp/bandscope/project-local-1/rehearsal.wav",
    fileName: "rehearsal.wav",
    extension: "wav",
    fileSizeBytes: 1024
  }
};

describe("project persistence recovery", () => {
  beforeEach(() => {
    mocks.getAnalysisJobStatus.mockReset();
    mocks.importYoutubeUrl.mockReset();
    mocks.loadProject.mockReset();
    mocks.saveProject.mockReset();
    mocks.selectLocalAudioSource.mockReset();
    mocks.startAnalysisJob.mockReset();
    mocks.subscribeToAnalysisJobUpdates.mockReset();
    mocks.subscribeToAnalysisJobUpdates.mockResolvedValue(() => undefined);
  });

  it("replaces a stale analysis failure with failed project-load recovery", async () => {
    mocks.selectLocalAudioSource.mockResolvedValue({ ok: true, bootstrap: localBootstrap });
    mocks.startAnalysisJob.mockRejectedValue(new Error("engine unavailable"));
    mocks.loadProject.mockRejectedValue(new Error("Corrupt file"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByText(/rehearsal\.wav/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/analysis could not start/i);
    });

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Choose another project/i })).toBeTruthy();
    });

    expect(screen.queryByText(/An error occurred during analysis/i)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(/Failed to load project: Corrupt file/i);
  });
});
