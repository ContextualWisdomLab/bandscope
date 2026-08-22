import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const analysisMocks = vi.hoisted(() => ({
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(() => false),
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
 * - This test supplies only synthetic analysis data and safe allowlisted local-intake failure copy.
 * - No filesystem, network, subprocess, or native-picker authority is exercised.
 */
describe("App local selection failure visibility", () => {
  beforeEach(() => {
    for (const mock of Object.values(analysisMocks)) {
      mock.mockReset();
    }
    analysisMocks.isSupportedYoutubeUrl.mockReturnValue(false);
    analysisMocks.subscribeToAnalysisJobUpdates.mockResolvedValue(() => undefined);
    analysisMocks.loadProject.mockResolvedValue(createDemoRehearsalSong());
    analysisMocks.selectLocalAudioSource.mockResolvedValue({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Choose a WAV, MP3, FLAC, or M4A file to start analysis."
      }
    });
  });

  it("surfaces local replacement failure even when a rehearsal result is already loaded", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open Project" }));
    await waitFor(() => expect(screen.getByText("Late Night Set")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Choose local audio" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "That file can't start tonight" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Choose another song" })).toBeTruthy();
    });
  });
});
