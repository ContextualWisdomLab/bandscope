import type { ButtonHTMLAttributes } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectBootstrapSummary, RehearsalSong } from "@bandscope/shared-types";
import { App } from "./App";
import { loadProject, selectLocalAudioSource, startAnalysisJob } from "./lib/analysis";

vi.mock("./features/score/ScoreView", () => ({
  ScoreView: () => <div>Score view</div>
}));

vi.mock("./features/workspace/Workspace", () => ({
  Workspace: () => <div>Workspace result</div>
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} data-disabled={disabled ? "true" : "false"} />
  )
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

const mockedLoadProject = vi.mocked(loadProject);
const mockedSelectLocalAudioSource = vi.mocked(selectLocalAudioSource);
const mockedStartAnalysisJob = vi.mocked(startAnalysisJob);

/** Return a deterministic selected source for source-transition tests. */
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

/** Return a minimal loaded rehearsal project. */
function loadedSong(): RehearsalSong {
  return {
    id: "loaded-song",
    title: "Loaded project",
    sections: [],
    exportSummary: {
      format: "cue-sheet",
      headline: "Loaded",
      focusSections: []
    }
  };
}

describe("App source-transition handler guards", () => {
  beforeEach(() => {
    mockedLoadProject.mockReset();
    mockedSelectLocalAudioSource.mockReset();
    mockedStartAnalysisJob.mockReset();
  });

  it("rejects a bypassed local-source action while project loading is pending", async () => {
    let resolveProject: ((song: RehearsalSong) => void) | null = null;
    mockedLoadProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProject = resolve;
        })
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open project/i }));
    const chooseLocal = screen.getByRole("button", { name: /choose local audio/i });

    await waitFor(() => {
      expect(chooseLocal).toHaveAttribute("data-disabled", "true");
    });

    // This test Button deliberately does not enforce `disabled`; the App handler
    // must still reject a stale source transition while project loading owns state.
    fireEvent.click(chooseLocal);
    expect(mockedSelectLocalAudioSource).not.toHaveBeenCalled();

    resolveProject?.(loadedSong());
    await screen.findByText("Workspace result");
  });

  it("rejects a bypassed project load while local-source selection is pending", async () => {
    let resolveSelection:
      | ((value: { ok: false; error: { code: "invalid_request"; message: string } }) => void)
      | null = null;
    mockedSelectLocalAudioSource.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSelection = resolve;
        })
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    const openProject = screen.getByRole("button", { name: /open project/i });

    await waitFor(() => {
      expect(openProject).toHaveAttribute("data-disabled", "true");
    });

    fireEvent.click(openProject);
    expect(mockedLoadProject).not.toHaveBeenCalled();

    resolveSelection?.({
      ok: false,
      error: { code: "invalid_request", message: "Selection cancelled." }
    });
    await waitFor(() => {
      expect(openProject).toHaveAttribute("data-disabled", "false");
    });
  });

  it("rejects bypassed analysis while a replacement source selection is pending", async () => {
    let resolveReplacement:
      | ((value: { ok: false; error: { code: "invalid_request"; message: string } }) => void)
      | null = null;
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
    const startAnalysis = screen.getByRole("button", { name: /^start analysis$/i });
    await waitFor(() => {
      expect(startAnalysis).toHaveAttribute("data-disabled", "false");
    });

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(startAnalysis).toHaveAttribute("data-disabled", "true");
    });

    fireEvent.click(startAnalysis);
    expect(mockedStartAnalysisJob).not.toHaveBeenCalled();

    resolveReplacement?.({
      ok: false,
      error: { code: "invalid_request", message: "Selection cancelled." }
    });
    await waitFor(() => {
      expect(startAnalysis).toHaveAttribute("data-disabled", "false");
    });
  });
});
