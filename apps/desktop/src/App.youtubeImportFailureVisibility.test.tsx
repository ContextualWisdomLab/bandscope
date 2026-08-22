import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const analysisMocks = vi.hoisted(() => ({
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(() => true),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: vi.fn(),
  startAnalysisJob: vi.fn(),
  subscribeToAnalysisJobUpdates: vi.fn(async () => () => undefined)
}));

vi.mock("./lib/analysis", () => ({
  createDefaultAnalysisRequest: () => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["bass-guitar", "keys-right", "lead-vocal"]
  }),
  getAnalysisJobStatus: analysisMocks.getAnalysisJobStatus,
  importYoutubeUrl: analysisMocks.importYoutubeUrl,
  isSupportedYoutubeUrl: analysisMocks.isSupportedYoutubeUrl,
  loadProject: analysisMocks.loadProject,
  MAX_YOUTUBE_URL_LENGTH: 2048,
  saveProject: analysisMocks.saveProject,
  selectLocalAudioSource: analysisMocks.selectLocalAudioSource,
  startAnalysisJob: analysisMocks.startAnalysisJob,
  subscribeToAnalysisJobUpdates: analysisMocks.subscribeToAnalysisJobUpdates
}));

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div>Score view</div>
}));

const localBootstrap = {
  projectId: "project-1",
  sourceMode: "reference",
  projectRoot: "/tmp/bandscope/projects/project-1",
  cacheRoot: "/tmp/bandscope/cache/project-1",
  tempRoot: "/tmp/bandscope/temp/project-1",
  source: {
    sourcePath: "/tmp/bandscope/song.wav",
    fileName: "song.wav",
    extension: "wav",
    fileSizeBytes: 1024
  }
};

/**
 * Security Notes:
 * - Untrusted input: YouTube import failure copy, including URL-shaped diagnostics.
 * - Trust boundary: mocked import bridge → buyer-visible recovery card.
 * - Safe failure: the named action only focuses the YouTube field; it does not retry the network.
 * - Privacy: live URLs and local paths must not appear in the recovery heading or action label.
 */
describe("App YouTube import failure visibility", () => {
  beforeEach(() => {
    for (const mock of Object.values(analysisMocks)) {
      mock.mockReset();
    }
    analysisMocks.isSupportedYoutubeUrl.mockReturnValue(true);
    analysisMocks.subscribeToAnalysisJobUpdates.mockResolvedValue(() => undefined);
    analysisMocks.loadProject.mockResolvedValue(createDemoRehearsalSong());
    analysisMocks.importYoutubeUrl.mockResolvedValue({
      ok: false,
      error: {
        code: "invalid_request",
        message: "This video is age restricted."
      }
    });
  });

  it("surfaces YouTube import failure even when a rehearsal result is already loaded", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Project" }));
    await waitFor(() => expect(screen.getByText("Late Night Set")).toBeTruthy());

    const input = screen.getByRole("textbox", { name: "YouTube URL" });
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45" } });
    fireEvent.click(screen.getByRole("button", { name: "Import YouTube" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "That YouTube link can't start tonight" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Paste another YouTube link" })).toBeTruthy();
    });
    expect(screen.getByText(/This video is age restricted/i)).toBeTruthy();
    expect(screen.queryByText(/https:\/\/youtube\.com/i)).toBeNull();
  });

  it("clears stale YouTube recovery after a project opens successfully", async () => {
    render(<App />);

    const input = screen.getByRole("textbox", { name: "YouTube URL" });
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45" } });
    fireEvent.click(screen.getByRole("button", { name: "Import YouTube" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "That YouTube link can't start tonight" })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Project" }));

    await waitFor(() => expect(screen.getByText("Late Night Set")).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "That YouTube link can't start tonight" })).toBeNull();
  });

  it("clears stale YouTube recovery when analysis starts from an admitted local source", async () => {
    analysisMocks.selectLocalAudioSource.mockResolvedValue({ ok: true, bootstrap: localBootstrap });
    analysisMocks.startAnalysisJob.mockResolvedValue({
      jobId: "job-1",
      state: "succeeded",
      requestedAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:01.000Z",
      progressLabel: "Analysis ready",
      result: createDemoRehearsalSong()
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Choose local audio" }));
    await waitFor(() => expect(analysisMocks.selectLocalAudioSource).toHaveBeenCalledTimes(1));

    const input = screen.getByRole("textbox", { name: "YouTube URL" });
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45" } });
    fireEvent.click(screen.getByRole("button", { name: "Import YouTube" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "That YouTube link can't start tonight" })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Analysis" }));

    await waitFor(() => expect(analysisMocks.startAnalysisJob).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Late Night Set")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "That YouTube link can't start tonight" })).toBeNull();
  });

  it("announces a YouTube failure through one assertive alert while keeping field description", async () => {
    render(<App />);

    const input = screen.getByRole("textbox", { name: "YouTube URL" });
    fireEvent.change(input, { target: { value: "https://youtube.com/watch?v=abc123DEF45" } });
    fireEvent.click(screen.getByRole("button", { name: "Import YouTube" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "That YouTube link can't start tonight" })).toBeTruthy()
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(input.getAttribute("aria-describedby")).toBe("selection-error");
    expect(document.getElementById("selection-error")?.textContent).toContain("This video is age restricted.");
  });
});
