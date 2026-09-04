import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  importYoutubeUrl,
  selectLocalAudioSource,
  type LocalAudioSelectionResult
} from "./lib/analysis";

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div>Score view</div>
}));

vi.mock("./features/workspace/Workspace", () => ({
  Workspace: () => <div>Workspace result</div>
}));

vi.mock("./lib/analysis", () => ({
  MAX_YOUTUBE_URL_LENGTH: 2048,
  createDefaultAnalysisRequest: vi.fn(() => ({
    sourceKind: "demo",
    sourceLabel: "Late Night Set",
    roleFocus: ["keys-right"]
  })),
  getAnalysisJobStatus: vi.fn(),
  importYoutubeUrl: vi.fn(),
  isSupportedYoutubeUrl: vi.fn(() => true),
  loadProject: vi.fn(),
  saveProject: vi.fn(),
  selectLocalAudioSource: vi.fn(),
  startAnalysisJob: vi.fn(),
  subscribeToAnalysisJobUpdates: vi.fn(async () => () => undefined)
}));

vi.mock("./lib/handoff", async (importActual) => {
  const actual = await importActual<typeof import("./lib/handoff")>();
  return {
    ...actual,
    readMetadataHandoffFile: vi.fn()
  };
});

const mockedImportYoutubeUrl = vi.mocked(importYoutubeUrl);
const mockedSelectLocalAudioSource = vi.mocked(selectLocalAudioSource);

const cancelledSelection: LocalAudioSelectionResult = {
  ok: false,
  error: {
    code: "invalid_request",
    message: "Selection cancelled."
  }
};

describe("App source-selection project exclusion", () => {
  beforeEach(() => {
    mockedImportYoutubeUrl.mockReset();
    mockedSelectLocalAudioSource.mockReset();
  });

  it("blocks project replacement while local audio selection is pending", async () => {
    let resolveSelection: ((value: LocalAudioSelectionResult) => void) | null = null;
    mockedSelectLocalAudioSource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSelection = resolve;
        })
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open project/i })).toBeDisabled();
    });

    resolveSelection?.(cancelledSelection);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open project/i })).not.toBeDisabled();
    });
  });

  it("blocks project replacement while YouTube import is pending", async () => {
    let resolveImport: ((value: LocalAudioSelectionResult) => void) | null = null;
    mockedImportYoutubeUrl.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    render(<App />);

    fireEvent.change(screen.getByLabelText(/youtube url/i), {
      target: { value: "https://youtu.be/abc123DEF45" }
    });
    fireEvent.click(screen.getByRole("button", { name: /import youtube/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open project/i })).toBeDisabled();
    });

    resolveImport?.(cancelledSelection);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open project/i })).not.toBeDisabled();
    });
  });
});
