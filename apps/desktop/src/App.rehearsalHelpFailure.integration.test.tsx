import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const analysisMocks = vi.hoisted(() => ({
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(),
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
  isSupportedYoutubeUrl: analysisMocks.isSupportedYoutubeUrl,
  loadProject: analysisMocks.loadProject,
  MAX_YOUTUBE_URL_LENGTH: 2048,
  saveProject: analysisMocks.saveProject,
  selectLocalAudioSource: analysisMocks.selectLocalAudioSource,
  startAnalysisJob: analysisMocks.startAnalysisJob,
  subscribeToAnalysisJobUpdates: analysisMocks.subscribeToAnalysisJobUpdates,
}));

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div data-testid="score-view">Score view</div>,
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

/**
 * Security Notes:
 * - Local paths in this suite are synthetic test fixtures and are never rendered in customer-facing copy.
 * - The suite mocks the existing picker and analysis boundaries; it adds no network access or IPC permission.
 */
describe("App rehearsal-help failure recovery", () => {
  beforeEach(() => {
    for (const mock of Object.values(analysisMocks)) {
      mock.mockReset();
    }
    analysisMocks.isSupportedYoutubeUrl.mockReturnValue(false);
    analysisMocks.subscribeToAnalysisJobUpdates.mockResolvedValue(() => undefined);
  });

  it("exposes rehearsal help from compact navigation", () => {
    render(<App />);

    const compactHelp = screen.getByRole("button", { name: /how bandscope helps tonight/i });
    const compactNav = compactHelp.closest("nav");

    expect(compactNav?.getAttribute("aria-label")).toMatch(/compact rehearsal views/i);
    fireEvent.click(compactHelp);
    expect(screen.getByTestId("rehearsal-help-dialog")).toBeTruthy();
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

  it("forgets the previous analyzed song when a different local source is selected", async () => {
    analysisMocks.selectLocalAudioSource
      .mockResolvedValueOnce({ ok: true, bootstrap: bootstrap("project-a", "analyzed-song.wav") })
      .mockResolvedValueOnce({ ok: true, bootstrap: bootstrap("project-b", "fresh-song.wav") });
    analysisMocks.startAnalysisJob.mockResolvedValueOnce({
      jobId: "job-help-succeeded",
      state: "succeeded",
      requestedAt: "2026-08-21T05:10:00.000Z",
      updatedAt: "2026-08-21T05:10:01.000Z",
      progressLabel: "Analysis ready",
      progressStage: "ready",
      progressPercent: 100,
      cacheStatus: "disabled",
      result: createDemoRehearsalSong(),
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/analyzed-song\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save project/i }).getAttribute("aria-disabled")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/fresh-song\.wav/i)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /open rehearsal help/i }));
    const helpDialog = screen.getByTestId("rehearsal-help-dialog");
    expect(within(helpDialog).getByTestId("rehearsal-help-next-action").textContent).toMatch(
      /start analysis to get tonight's first cues/i,
    );
    expect(within(helpDialog).queryByRole("button", { name: /show the rehearsal map/i })).toBeNull();
  });

  it("does not start stale local analysis from help while a YouTube import is in flight", async () => {
    let resolveImport: ((value: unknown) => void) | undefined;
    analysisMocks.isSupportedYoutubeUrl.mockReturnValue(true);
    analysisMocks.selectLocalAudioSource.mockResolvedValueOnce({
      ok: true,
      bootstrap: bootstrap("project-local", "local-song.wav"),
    });
    analysisMocks.importYoutubeUrl.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/local-song\.wav/i)).toBeTruthy());

    fireEvent.change(screen.getByRole("textbox", { name: /youtube url/i }), {
      target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: /import youtube/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /import youtube/i }).textContent).toMatch(/importing/i);
    });

    fireEvent.click(screen.getByRole("button", { name: /open rehearsal help/i }));
    const helpDialog = screen.getByTestId("rehearsal-help-dialog");
    fireEvent.click(within(helpDialog).getByRole("button", { name: /^start analysis$/i }));

    expect(analysisMocks.startAnalysisJob).not.toHaveBeenCalled();

    resolveImport?.({ ok: true, bootstrap: bootstrap("project-youtube", "imported-song.m4a") });
    await waitFor(() => expect(screen.getByText(/imported-song\.m4a/i)).toBeTruthy());
  });

  it("switches from score back to the workspace before showing the rehearsal map", async () => {
    analysisMocks.selectLocalAudioSource.mockResolvedValueOnce({
      ok: true,
      bootstrap: bootstrap("project-map", "map-song.wav"),
    });
    analysisMocks.startAnalysisJob.mockResolvedValueOnce({
      jobId: "job-help-map",
      state: "succeeded",
      requestedAt: "2026-08-21T05:20:00.000Z",
      updatedAt: "2026-08-21T05:20:01.000Z",
      progressLabel: "Analysis ready",
      progressStage: "ready",
      progressPercent: 100,
      cacheStatus: "disabled",
      result: createDemoRehearsalSong(),
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => expect(screen.getByText(/map-song\.wav/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save project/i }).getAttribute("aria-disabled")).toBeNull();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^score$/i })[0]!);
    await waitFor(() => expect(screen.getByTestId("score-view")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /open rehearsal help/i }));
    const helpDialog = screen.getByTestId("rehearsal-help-dialog");
    fireEvent.click(within(helpDialog).getByRole("button", { name: /show the rehearsal map/i }));

    await waitFor(() => expect(screen.queryByTestId("score-view")).toBeNull());
    await waitFor(() => expect(screen.queryByTestId("rehearsal-help-dialog")).toBeNull());
    expect(document.activeElement?.id).toBe("main-content");
  });
});
