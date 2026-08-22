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
});
