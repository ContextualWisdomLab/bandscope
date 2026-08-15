import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectBootstrapSummary } from "@bandscope/shared-types";
import { App } from "./App";
import { selectLocalAudioSource } from "./lib/analysis";

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

const mockedSelectLocalAudioSource = vi.mocked(selectLocalAudioSource);

/** Return a deterministic local source after the picker completes. */
function selectedSource(): ProjectBootstrapSummary {
  return {
    projectId: "recipient-project",
    sourceMode: "reference",
    projectRoot: "/tmp/bandscope/projects/recipient-project",
    cacheRoot: "/tmp/bandscope/cache/recipient-project",
    tempRoot: "/tmp/bandscope/temp/recipient-project",
    source: {
      sourcePath: "/Users/recipient/Music/late-night-set.wav",
      fileName: "late-night-set.wav",
      extension: "wav",
      fileSizeBytes: 1_024_000
    }
  };
}

describe("App source-action mutual exclusion", () => {
  beforeEach(() => {
    mockedSelectLocalAudioSource.mockReset();
  });

  it("blocks competing source actions while local audio selection is pending", async () => {
    let resolveSelection: ((value: { ok: true; bootstrap: ProjectBootstrapSummary }) => void) | null = null;
    mockedSelectLocalAudioSource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSelection = resolve;
        })
    );
    render(<App />);

    const youtubeInput = screen.getByLabelText(/youtube url/i);
    fireEvent.change(youtubeInput, { target: { value: "https://youtu.be/rehearsal" } });
    expect(screen.getByRole("button", { name: /import youtube/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /choose local audio/i })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: /import handoff/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /import youtube/i })).toBeDisabled();
    expect(youtubeInput).toBeDisabled();

    resolveSelection?.({ ok: true, bootstrap: selectedSource() });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /choose local audio/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /import handoff/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /import youtube/i })).not.toBeDisabled();
      expect(youtubeInput).not.toBeDisabled();
    });
  });

  it("blocks analysis while a replacement local source is still being selected", async () => {
    let resolveReplacement: ((value: { ok: true; bootstrap: ProjectBootstrapSummary }) => void) | null = null;
    mockedSelectLocalAudioSource
      .mockResolvedValueOnce({ ok: true, bootstrap: selectedSource() })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReplacement = resolve;
          })
      );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^start analysis$/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^start analysis$/i })).toBeDisabled();
    });

    resolveReplacement?.({ ok: true, bootstrap: selectedSource() });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^start analysis$/i })).not.toBeDisabled();
    });
  });
});
