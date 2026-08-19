import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisJobStatus, ProjectBootstrapSummary, RehearsalSong } from "@bandscope/shared-types";
import { App } from "./App";
import {
  getAnalysisJobStatus,
  selectLocalAudioSource,
  startAnalysisJob,
  subscribeToAnalysisJobUpdates
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
  subscribeToAnalysisJobUpdates: vi.fn()
}));

const mockedGetAnalysisJobStatus = vi.mocked(getAnalysisJobStatus);
const mockedSelectLocalAudioSource = vi.mocked(selectLocalAudioSource);
const mockedStartAnalysisJob = vi.mocked(startAnalysisJob);
const mockedSubscribeToAnalysisJobUpdates = vi.mocked(subscribeToAnalysisJobUpdates);

/** Return a deterministic local source accepted by the analysis launcher. */
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

/** Build a queued status with a distinct job identity. */
function queuedStatus(jobId: string): AnalysisJobStatus {
  return {
    jobId,
    state: "queued",
    requestedAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    progressLabel: "Queued for analysis"
  };
}

/** Build a successful result whose headline is visible in the App shell. */
function succeededStatus(jobId: string, headline: string): AnalysisJobStatus {
  const result = {
    id: `${jobId}-song`,
    title: `${jobId} song`,
    sections: [],
    exportSummary: {
      format: "cue-sheet",
      headline,
      focusSections: []
    }
  } as RehearsalSong;

  return {
    jobId,
    state: "succeeded",
    requestedAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:01.000Z",
    progressLabel: "Analysis ready",
    result
  };
}

describe("App stale analysis polling", () => {
  beforeEach(() => {
    mockedGetAnalysisJobStatus.mockReset();
    mockedSelectLocalAudioSource.mockReset();
    mockedStartAnalysisJob.mockReset();
    mockedSubscribeToAnalysisJobUpdates.mockReset();
  });

  it("ignores a completed poll from an older job after a newer job starts", async () => {
    const subscriptions = new Map<string, (status: AnalysisJobStatus) => void>();
    let resolveOldPoll: ((status: AnalysisJobStatus) => void) | null = null;

    mockedSelectLocalAudioSource.mockResolvedValue({ ok: true, bootstrap: selectedSource() });
    mockedStartAnalysisJob
      .mockResolvedValueOnce(queuedStatus("job-old"))
      .mockResolvedValueOnce(queuedStatus("job-new"));
    mockedGetAnalysisJobStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOldPoll = resolve;
        })
    );
    mockedSubscribeToAnalysisJobUpdates.mockImplementation(async (jobId, onUpdate) => {
      subscriptions.set(jobId, onUpdate);
      return () => {
        subscriptions.delete(jobId);
      };
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /choose local audio/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^start analysis$/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));
    await waitFor(() => {
      expect(mockedGetAnalysisJobStatus).toHaveBeenCalledWith("job-old");
    });

    const oldSubscription = subscriptions.get("job-old");
    expect(oldSubscription).toBeDefined();
    act(() => {
      oldSubscription?.(succeededStatus("job-old", "Old analysis must stay stale"));
    });
    await waitFor(() => {
      expect(screen.getAllByText("Old analysis must stay stale")).not.toHaveLength(0);
      expect(screen.getByRole("button", { name: /^start analysis$/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /^start analysis$/i }));
    await waitFor(() => {
      expect(mockedStartAnalysisJob).toHaveBeenCalledTimes(2);
      expect(mockedSubscribeToAnalysisJobUpdates).toHaveBeenCalledWith("job-new", expect.any(Function));
      expect(screen.queryAllByText("Old analysis must stay stale")).toHaveLength(0);
    });

    await act(async () => {
      resolveOldPoll?.(succeededStatus("job-old", "Old analysis must stay stale"));
      await Promise.resolve();
    });

    expect(screen.queryAllByText("Old analysis must stay stale")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Queued for analysis");
  });
});
