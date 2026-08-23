import type { ProjectBootstrapSummary } from "@bandscope/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { LocalAudioSelectionResult } from "./lib/analysis";

const analysisMocks = vi.hoisted(() => ({
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(() => false),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: vi.fn<() => Promise<LocalAudioSelectionResult>>(),
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
  isSupportedYoutubeUrl: analysisMocks.isSupportedYoutubeUrl,
  loadProject: analysisMocks.loadProject,
  MAX_YOUTUBE_URL_LENGTH: 2048,
  saveProject: analysisMocks.saveProject,
  selectLocalAudioSource: analysisMocks.selectLocalAudioSource,
  startAnalysisJob: analysisMocks.startAnalysisJob,
  subscribeToAnalysisJobUpdates: analysisMocks.subscribeToAnalysisJobUpdates,
}));

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div>Score view</div>,
}));

const selectedBootstrap = {
  projectId: "project-local-intake",
  sourceMode: "reference",
  projectRoot: "/tmp/bandscope/projects/project-local-intake",
  cacheRoot: "/tmp/bandscope/cache/project-local-intake",
  tempRoot: "/tmp/bandscope/temp/project-local-intake",
  source: {
    sourcePath: "/Users/test/Music/selected-song.wav",
    fileName: "selected-song.wav",
    extension: "wav",
    fileSizeBytes: 1024,
  },
} satisfies ProjectBootstrapSummary;

type SuccessfulLocalAudioSelection = Extract<LocalAudioSelectionResult, { ok: true }>;

/**
 * Security Notes:
 * - The selected path is a synthetic test fixture and is not asserted as buyer-visible copy.
 * - This test mocks the existing local-picker boundary and adds no filesystem, network, or IPC authority.
 */
describe("App local song intake concurrency", () => {
  beforeEach(() => {
    for (const mock of Object.values(analysisMocks)) {
      mock.mockReset();
    }
    analysisMocks.isSupportedYoutubeUrl.mockReturnValue(false);
    analysisMocks.subscribeToAnalysisJobUpdates.mockResolvedValue(() => undefined);
  });

  it("allows only one local picker while the first selection is pending", async () => {
    let resolveSelection: ((value: SuccessfulLocalAudioSelection) => void) | undefined;
    analysisMocks.selectLocalAudioSource.mockImplementation(
      () =>
        new Promise<SuccessfulLocalAudioSelection>((resolve) => {
          resolveSelection = resolve;
        }),
    );

    render(<App />);

    const emptyAction = screen.getByRole("button", { name: "Use my own song" });
    const headerAction = screen.getByRole("button", { name: "Choose local audio" });
    fireEvent.click(emptyAction);

    await waitFor(() => {
      expect(emptyAction).toBeDisabled();
      expect(headerAction).toBeDisabled();
    });

    fireEvent.click(emptyAction);
    fireEvent.click(headerAction);
    expect(analysisMocks.selectLocalAudioSource).toHaveBeenCalledTimes(1);

    resolveSelection?.({ ok: true, bootstrap: selectedBootstrap });
    await waitFor(() => expect(screen.getByText("selected-song.wav")).toBeTruthy());
  });

  it("blocks every YouTube source control while the local picker owns source selection", async () => {
    let resolveSelection: ((value: SuccessfulLocalAudioSelection) => void) | undefined;
    analysisMocks.isSupportedYoutubeUrl.mockReturnValue(true);
    analysisMocks.selectLocalAudioSource.mockImplementation(
      () =>
        new Promise<SuccessfulLocalAudioSelection>((resolve) => {
          resolveSelection = resolve;
        }),
    );

    render(<App />);

    const youtubeInput = screen.getByRole("textbox", { name: "YouTube URL" });
    const youtubeImport = screen.getByRole("button", { name: "Import YouTube" });
    fireEvent.change(youtubeInput, { target: { value: "https://www.youtube.com/watch?v=demo" } });
    expect(youtubeImport).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear YouTube URL" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use my own song" }));

    await waitFor(() => {
      expect(youtubeInput).toBeDisabled();
      expect(youtubeImport).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Clear YouTube URL" })).toBeNull();
    });

    fireEvent.click(youtubeImport);
    expect(analysisMocks.importYoutubeUrl).not.toHaveBeenCalled();

    resolveSelection?.({ ok: true, bootstrap: selectedBootstrap });
    await waitFor(() => expect(screen.getByText("selected-song.wav")).toBeTruthy());
  });
});