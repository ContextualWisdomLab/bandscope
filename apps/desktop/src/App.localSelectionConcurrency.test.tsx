import { createDemoRehearsalSong, type ProjectBootstrapSummary } from "@bandscope/shared-types";
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
  selectDemoAudioSource: vi.fn<() => Promise<LocalAudioSelectionResult>>(),
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
  selectDemoAudioSource: analysisMocks.selectDemoAudioSource,
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
 * Preserve #980's source-selection concurrency contract on the canonical #964 demo lane.
 * The synthetic path is fixture-only and is never asserted as buyer-visible output.
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
    emptyAction.removeAttribute("disabled");
    fireEvent.click(emptyAction);
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

    fireEvent.click(screen.getByRole("button", { name: "Use my own song" }));

    await waitFor(() => {
      expect(youtubeInput).toBeDisabled();
      expect(youtubeImport).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Clear YouTube URL" })).toBeNull();
    });

    youtubeImport.removeAttribute("disabled");
    fireEvent.click(youtubeImport);
    expect(analysisMocks.importYoutubeUrl).not.toHaveBeenCalled();

    resolveSelection?.({ ok: true, bootstrap: selectedBootstrap });
    await waitFor(() => expect(screen.getByText("selected-song.wav")).toBeTruthy());
  });

  it("blocks analysis while a replacement local picker is pending", async () => {
    let resolveSelection: ((value: SuccessfulLocalAudioSelection) => void) | undefined;
    analysisMocks.selectLocalAudioSource
      .mockResolvedValueOnce({ ok: true, bootstrap: selectedBootstrap })
      .mockImplementationOnce(
        () =>
          new Promise<SuccessfulLocalAudioSelection>((resolve) => {
            resolveSelection = resolve;
          }),
      );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Use my own song" }));
    await waitFor(() => expect(screen.getByText("selected-song.wav")).toBeTruthy());

    const startAnalysis = screen.getByRole("button", { name: "Start analysis" });
    expect(startAnalysis).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Choose local audio" }));

    await waitFor(() => expect(startAnalysis).toBeDisabled());

    resolveSelection?.({ ok: true, bootstrap: selectedBootstrap });
    await waitFor(() => expect(startAnalysis).not.toBeDisabled());
  });

  it("serializes project loading after source selection takes intake authority", async () => {
    let resolveSelection: ((value: SuccessfulLocalAudioSelection) => void) | undefined;
    analysisMocks.selectLocalAudioSource.mockImplementation(
      () =>
        new Promise<SuccessfulLocalAudioSelection>((resolve) => {
          resolveSelection = resolve;
        }),
    );
    analysisMocks.loadProject.mockResolvedValue(createDemoRehearsalSong());

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Use my own song" }));

    const openProject = screen.getByRole("button", { name: "Open Project" });
    await waitFor(() => expect(openProject).toBeDisabled());
    openProject.removeAttribute("disabled");
    fireEvent.click(openProject);
    expect(analysisMocks.loadProject).not.toHaveBeenCalled();

    resolveSelection?.({ ok: true, bootstrap: selectedBootstrap });
    await waitFor(() => expect(screen.getByText("selected-song.wav")).toBeTruthy());
  });

  it("serializes source selection after project loading takes intake authority", async () => {
    let resolveProject: ((value: ReturnType<typeof createDemoRehearsalSong>) => void) | undefined;
    analysisMocks.loadProject.mockImplementation(
      () =>
        new Promise<ReturnType<typeof createDemoRehearsalSong>>((resolve) => {
          resolveProject = resolve;
        }),
    );
    analysisMocks.selectLocalAudioSource.mockResolvedValue({ ok: true, bootstrap: selectedBootstrap });

    render(<App />);
    const openProject = screen.getByRole("button", { name: "Open Project" });
    const chooseLocalAudio = screen.getByRole("button", { name: "Choose local audio" });
    fireEvent.click(openProject);

    await waitFor(() => {
      expect(openProject).toBeDisabled();
      expect(chooseLocalAudio).toBeDisabled();
    });
    chooseLocalAudio.removeAttribute("disabled");
    fireEvent.click(chooseLocalAudio);
    expect(analysisMocks.selectLocalAudioSource).not.toHaveBeenCalled();

    resolveProject?.(createDemoRehearsalSong());
    await waitFor(() => expect(screen.getByText("Late Night Set")).toBeTruthy());
  });

});
